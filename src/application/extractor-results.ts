import type { ExtractionContext, FactExtractor } from '@weftlet/core';

/** Stateless per-invocation results retain adapter gaps without changing existing adapters. */
export async function extractEvidence(extractors: readonly FactExtractor[], context: ExtractionContext) {
  const results = await Promise.all(extractors.map(async extractor => extractor.extractWithDiagnostics
    ? extractor.extractWithDiagnostics(context) : { facts: await extractor.extract(context), diagnostics: [] }));
  return { facts: results.flatMap(result => result.facts), diagnostics: results.flatMap(result => result.diagnostics) };
}
