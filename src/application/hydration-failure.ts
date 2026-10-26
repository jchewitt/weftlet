import { SemanticProviderError } from '../extraction/semantic-process.js';
import { SemanticPolicyError, type SemanticHydrationPhase } from '../extraction/semantic-diagnostics.js';

export type SemanticFailureCode = SemanticProviderError['code'] | SemanticPolicyError['code'] | 'cache-failure' | 'provider-failure';
export interface SemanticRunProgress {
  readonly total: number;
  readonly completed: number;
  readonly extracted: number;
  readonly reused: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly notStarted: number;
  /** Includes failed, cancelled and not-started sources; it is not an extraction estimate. */
  readonly remaining: number;
}

export interface SemanticHydrationFailure {
  readonly schemaVersion: 1;
  readonly kind: 'semantic-hydration-failure';
  readonly code: SemanticFailureCode;
  readonly category: 'timeout' | 'cancellation' | 'provider' | 'infrastructure' | 'extraction-gap';
  readonly phase: SemanticHydrationPhase | 'semantic-scheduling';
  /** Absent when cancellation occurs between sources, without one failing source. */
  readonly sourceId?: string;
  readonly commitSha: string;
  readonly configurationDigest: string;
  /** Processing time through failure, including cache checks/retries for a source. */
  readonly elapsedMs: number;
  readonly elapsedScope: 'source' | 'semantic-run';
  readonly timeoutMs: number;
  readonly timeoutScope: 'provider-attempt' | 'module-execution';
  readonly progress: SemanticRunProgress;
  readonly forced: boolean;
  readonly recovery: readonly string[];
}

export function semanticFailureCode(error: unknown, phase: SemanticHydrationPhase, signal?: AbortSignal): SemanticFailureCode {
  if (signal?.aborted && (error === signal.reason ||
    (error instanceof Error && error.name === 'AbortError') ||
    (phase === 'semantic-extract' && !(error instanceof SemanticProviderError)))) return 'cancelled';
  if (error instanceof SemanticProviderError &&
    ['timeout', 'cancelled', 'unavailable', 'exit', 'invalid-output'].includes(error.code)) return error.code;
  if (error instanceof SemanticPolicyError && ['unresolved', 'low-confidence'].includes(error.code)) return error.code;
  if (phase === 'semantic-cache-read' || phase === 'semantic-cache-write') return 'cache-failure';
  return phase === 'semantic-validate' ? 'invalid-output' : 'provider-failure';
}

export function semanticFailureCategory(code: SemanticFailureCode): SemanticHydrationFailure['category'] {
  if (code === 'timeout') return 'timeout';
  if (code === 'cancelled') return 'cancellation';
  if (code === 'unavailable' || code === 'cache-failure') return 'infrastructure';
  if (code === 'invalid-output' || code === 'unresolved' || code === 'low-confidence') return 'extraction-gap';
  return 'provider';
}

/** Public failure envelope deliberately excludes raw errors, causes and provider output. */
export class SemanticHydrationError extends Error {
  readonly code: SemanticFailureCode;
  constructor(readonly report: SemanticHydrationFailure) {
    const p = report.progress;
    super(`Semantic hydration ${report.code}: ${report.sourceId ?? 'between semantic sources'}; phase ${report.phase}; ` +
      `${report.elapsedScope} elapsed ${report.elapsedMs} ms; configured ${report.timeoutScope} timeout ${report.timeoutMs} ms. ` +
      `${p.completed}/${p.total} completed (${p.extracted} extracted, ${p.reused} reused); ` +
      `${p.remaining} remaining (${p.failed} failed, ${p.cancelled} cancelled, ${p.notStarted} not started).\n` +
      report.recovery.join('\n'));
    this.name = 'SemanticHydrationError';
    this.code = report.code;
  }
}
