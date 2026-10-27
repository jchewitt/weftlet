import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContextGraphConfig } from './config.js';
import { resolveSemanticStorageRoots, resolveStorageRoot, semanticCachePartition } from './cache.js';

const checkout = resolve('public-cache-fixture', 'checkout');
const cache = resolve('public-cache-fixture', 'user-cache');
const config: ContextGraphConfig = {
  schemaVersion: 1,
  repositoryId: 'public/cache-fixture',
  namespace: 'https://example.test/public-cache/',
  semanticSources: ['docs'],
  approvedIntentSources: ['docs/owner.md'],
  codeRoots: ['src'],
  contractPatterns: [],
  evidenceRoots: ['test'],
  semantic: {
    provider: 'codex-cli', model: 'public-fixture-model', reasoningEffort: 'low',
    promptVersion: 'fixture-prompt-1', extractorVersion: '1', adapterVersion: '1',
    ontologyVersion: '1', minimumConfidence: 0.7, failOnUnresolved: true, concurrency: 1,
  },
  scip: { version: '0.4.0', command: 'fixture-indexer', args: [] },
  ontology: { backend: 'rdf', toolVersion: 'rdf-v1' },
  runtimeEvidence: [], storagePath: '.context-graph', storageScope: 'user',
};

const withSemantic = (change: Partial<ContextGraphConfig['semantic']>): ContextGraphConfig =>
  ({ ...config, semantic: { ...config.semantic, ...change } });
const operationalChanges: [string, Partial<ContextGraphConfig['semantic']>][] = [
  ['timeout default made explicit', { timeoutMs: 120_000 }],
  ['longer timeout', { timeoutMs: 240_000 }],
  ['approved ten-minute timeout', { timeoutMs: 600_000 }],
  ['retry default made explicit', { retries: 0 }],
  ['more retries', { retries: 2 }],
  ['more workers', { concurrency: 4 }],
  ['document default made explicit', { maxDocuments: 8 }],
  ['larger document cap', { maxDocuments: 100 }],
  ['byte default made explicit', { maxSourceBytes: 65_536 }],
  ['larger byte cap', { maxSourceBytes: 131_072 }],
];
const unknownSemantic = { ...config, semantic: { ...config.semantic, futureSetting: 'value' } };
const unknownRoot = { ...config, futureSetting: 'value' };

describe('semantic cache partitions', () => {
  it.each(operationalChanges)('shares Codex artifacts for %s while retaining an exact snapshot profile', (_label, change) => {
    const changed = withSemantic(change);
    const original = resolveSemanticStorageRoots(checkout, config, cache);
    const next = resolveSemanticStorageRoots(checkout, changed, cache);
    expect(semanticCachePartition(checkout, changed)).toBe(semanticCachePartition(checkout, config));
    expect(next.primary).toBe(original.primary);
    expect(resolveStorageRoot(checkout, changed, cache)).not.toBe(resolveStorageRoot(checkout, config, cache));
    expect(original.legacy).toBe(resolveStorageRoot(checkout, config, cache));
    expect(next.legacy).toBe(resolveStorageRoot(checkout, changed, cache));
    expect(next.legacy).not.toBe(original.legacy);
  });

  it.each([
    ['model', withSemantic({ model: 'different-model' })],
    ['reasoning effort', withSemantic({ reasoningEffort: 'high' })],
    ['prompt version', withSemantic({ promptVersion: 'different-prompt' })],
    ['extractor version', withSemantic({ extractorVersion: '2' })],
    ['adapter version', withSemantic({ adapterVersion: '2' })],
    ['ontology version', withSemantic({ ontologyVersion: '2' })],
    ['confidence policy', withSemantic({ minimumConfidence: 0.9 })],
    ['unresolved policy', withSemantic({ failOnUnresolved: false })],
    ['authentication mode', withSemantic({ auth: { mode: 'api-key' } })],
    ['repository identity', { ...config, repositoryId: 'public/other-project' }],
    ['namespace', { ...config, namespace: 'https://example.test/other/' }],
    ['source approval', { ...config, approvedIntentSources: [] }],
    ['source selection', { ...config, semanticSources: ['docs/owner.md'] }],
    ['code roots', { ...config, codeRoots: ['other-src'] }],
    ['unknown semantic extension', unknownSemantic],
    ['unknown root extension', unknownRoot],
  ] satisfies [string, ContextGraphConfig][])('keeps %s distinct', (_label, changed) => {
    expect(semanticCachePartition(checkout, changed)).not.toBe(semanticCachePartition(checkout, config));
    expect(resolveSemanticStorageRoots(checkout, changed, cache).primary)
      .not.toBe(resolveSemanticStorageRoots(checkout, config, cache).primary);
  });

  it('separates worktrees, repositories, cache roots and authentication descriptors without reading credentials', () => {
    const original = resolveSemanticStorageRoots(checkout, config, cache);
    expect(resolveSemanticStorageRoots(resolve(checkout, '../other-checkout'), config, cache).primary).not.toBe(original.primary);
    expect(resolveSemanticStorageRoots(checkout, config, resolve(cache, '../other-user-cache')).primary).not.toBe(original.primary);
    const first = withSemantic({ auth: { mode: 'api-key', apiKeyEnv: 'PUBLIC_FIXTURE_KEY_A' } });
    const second = withSemantic({ auth: { mode: 'api-key', apiKeyEnv: 'PUBLIC_FIXTURE_KEY_B' } });
    const firstRoot = resolveSemanticStorageRoots(checkout, first, cache).primary;
    expect(firstRoot).not.toBe(resolveSemanticStorageRoots(checkout, second, cache).primary);
    expect(firstRoot).not.toContain('PUBLIC_FIXTURE_KEY_A');
    expect(semanticCachePartition(resolve(checkout, '.'), config)).toBe(semanticCachePartition(checkout, config));
  });

  it('retains complete module configuration identity and its existing storage path', () => {
    const moduleConfig: ContextGraphConfig = { ...config, semantic: { ...config.semantic,
      provider: 'module', providerModule: './public-provider.mjs', providerIdentity: 'public-provider:1' } };
    for (const [, change] of operationalChanges) {
      const changed = { ...moduleConfig, semantic: { ...moduleConfig.semantic, ...change } };
      expect(semanticCachePartition(checkout, changed)).not.toBe(semanticCachePartition(checkout, moduleConfig));
      expect(resolveSemanticStorageRoots(checkout, changed, cache))
        .toEqual({ primary: resolveStorageRoot(checkout, changed, cache) });
      expect(resolveStorageRoot(checkout, changed, cache)).not.toBe(resolveStorageRoot(checkout, moduleConfig, cache));
    }
  });

  it('preserves workspace and omitted-scope paths without adding a new pool or fallback', () => {
    for (const storageScope of ['workspace', undefined] as const) {
      for (const semantic of [config.semantic, { ...config.semantic, provider: 'module' as const,
        providerModule: './public-provider.mjs', providerIdentity: 'public-provider:1' }]) {
        const workspaceConfig: ContextGraphConfig = { ...config, storageScope, semantic };
        expect(resolveSemanticStorageRoots(checkout, workspaceConfig, cache))
          .toEqual({ primary: resolve(checkout, config.storagePath) });
      }
    }
  });
});
