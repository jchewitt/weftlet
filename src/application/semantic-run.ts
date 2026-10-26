import type { ExtractionContext, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import type { SemanticHydrator } from '../extraction/semantic.js';
import { semanticSourceId, type SemanticHydrationPhase } from '../extraction/semantic-diagnostics.js';
import { SemanticHydrationError, semanticFailureCategory, semanticFailureCode,
  type SemanticHydrationFailure } from './hydration-failure.js';

export interface HydrationProgressEvent {
  readonly phase: string;
  readonly completed?: number;
  readonly total?: number;
  readonly sourceId?: string;
  readonly elapsedMs?: number;
}

async function concurrentMap<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
  shouldStop: () => boolean,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, values.length)) }, async () => {
      while (!failed && !shouldStop() && cursor < values.length) {
        const index = cursor++;
        try { results[index] = await worker(values[index] as T, index); }
        catch (error) { failed = true; failure ??= error; }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}

/** Settle active workers before reporting failure; never publish snapshots here. */
export async function hydrateSemanticSources(options: {
  readonly sources: readonly SemanticSource[];
  readonly context: ExtractionContext;
  readonly config: ContextGraphConfig['semantic'];
  readonly configurationDigest: string;
  readonly hydrator: SemanticHydrator;
  readonly forceRevision?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: HydrationProgressEvent) => void;
}) {
  const { sources, context, config, configurationDigest, hydrator, forceRevision } = options;
  const { commitSha } = context;
  const runStarted = performance.now();
  let semanticExtracted = 0;
  let semanticReused = 0;
  let started = 0;
  let failed = 0;
  let cancelled = 0;
  let firstFailure: Pick<SemanticHydrationFailure, 'code' | 'sourceId' | 'phase' | 'elapsedMs' | 'elapsedScope'> | undefined;
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]);
  const hydrated = await concurrentMap(sources, config.concurrency, async (source) => {
    started += 1;
    const sourceId = semanticSourceId(context.repositoryId, source);
    const sourceStarted = performance.now();
    let phase: SemanticHydrationPhase = 'semantic-cache-read';
    options.onProgress?.({ phase: 'semantic-source-started', sourceId,
      completed: semanticExtracted + semanticReused, total: sources.length });
    let result;
    try {
      result = await hydrator.hydrate(source, context, forceRevision,
        { signal, onPhase: value => { phase = value; } });
    } catch (error) {
      // Record the initiating failure before abort synchronously notifies other workers.
      const code = semanticFailureCode(error, phase, signal);
      if (code === 'cancelled') cancelled += 1;
      else failed += 1;
      firstFailure ??= { code, sourceId, phase, elapsedScope: 'source', elapsedMs: Math.round(performance.now() - sourceStarted) };
      controller.abort();
      throw error;
    }
    if (result.reused) semanticReused += 1;
    else semanticExtracted += 1;
    options.onProgress?.({ phase: result.reused ? 'semantic-cache-hit' : 'semantic-extracted',
      sourceId, elapsedMs: Math.round(performance.now() - sourceStarted),
      completed: semanticReused + semanticExtracted, total: sources.length });
    return { source, ...result };
  }, () => signal.aborted).catch(() => {
    if (!firstFailure) throw new Error('Semantic hydration failed before source processing could be reported');
    return undefined;
  });
  // Cancellation can arrive during a durable write or completion callback, without
  // a failed source. Do not relabel successfully retained work as cancelled.
  if (!firstFailure && signal.aborted) firstFailure = { code: 'cancelled', phase: 'semantic-scheduling',
    elapsedScope: 'semantic-run', elapsedMs: Math.round(performance.now() - runStarted) };
  if (firstFailure) {
    // concurrentMap settles every active worker before returning: these are final counts.
    const completed = semanticExtracted + semanticReused;
    const recovery = [
      'No snapshot was published by this run. Previously published evidence and completed artifacts were retained.',
      'Inspect hydrate --plan --json locally with the same --config, committed --ref and scope options to map sourceId to its path and check expected reuse. The preview contains local paths; review it before sharing.',
    ];
    if (firstFailure.code === 'timeout') recovery.push(
      'Review semantic.timeoutMs before retrying. This limit is per Codex attempt (authentication is separately bounded), or covers module import/factory/extraction; source elapsed time can be longer.',
    );
    else if (firstFailure.code === 'unavailable') recovery.push('Run doctor with the same configuration to check provider installation and authentication.');
    else if (firstFailure.code === 'cache-failure') recovery.push('Inspect cache integrity and permissions. Corrupt or conflicting complete artifacts are retained and must be repaired explicitly; a timeout change cannot repair them.');
    else if (firstFailure.code === 'invalid-output') recovery.push('Review source coverage and extraction policy locally; invalid output is an extraction gap, not an approved rule or a passing validation.');
    else if (firstFailure.code === 'unresolved' || firstFailure.code === 'low-confidence') recovery.push('Review cited sources and configured confidence/unresolved policy locally. Required evidence needs review; a policy rejection is not approved intent or a passing validation.');
    else if (firstFailure.code === 'exit' || firstFailure.code === 'provider-failure') recovery.push('Check provider readiness locally. Private provider messages are omitted; this failure is not proof of a timeout.');
    recovery.push(forceRevision
      ? 'This run used --force-semantic. Its completed revision artifacts remain stored, but an ordinary rerun or a new forced run does not automatically reuse that revision.'
      : 'Rerun hydrate without --force-semantic after resolving the failure; only valid compatible completed artifacts are reusable.');
    recovery.push(config.provider === 'codex-cli'
      ? 'Built-in Codex supports reuse across operational timeout changes. For profiles created before shared caching, use cache adopt --from-config with the exact previous configuration; preview with --dry-run first.'
      : 'Custom provider identities include their full semantic configuration; changing a module timeout may invalidate reuse. Preview again before extraction.');
    throw new SemanticHydrationError({ schemaVersion: 1, kind: 'semantic-hydration-failure', ...firstFailure,
      category: semanticFailureCategory(firstFailure.code), commitSha, configurationDigest,
      timeoutMs: config.timeoutMs ?? 120_000,
      timeoutScope: config.provider === 'codex-cli' ? 'provider-attempt' : 'module-execution',
      progress: { total: sources.length, completed, extracted: semanticExtracted, reused: semanticReused,
        failed, cancelled, notStarted: sources.length - started, remaining: sources.length - completed },
      forced: !!forceRevision, recovery });
  }
  return { hydrated: hydrated!, semanticExtracted, semanticReused };
}
