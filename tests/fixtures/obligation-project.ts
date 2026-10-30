import type { ObligationDeclaration } from '@weftlet/core';

export const readingContract = { scope: 'sensor', id: 'readings', kind: 'stored-data' as const, version: '1' };
export const queueContract = { scope: 'sensor', id: 'analyze', kind: 'queue' as const, version: '1' };
export const producer: ObligationDeclaration = { schemaVersion: 1, id: 'collected-age', role: 'guarantee',
  endpoint: 'services/collector.ts', contract: readingContract,
  statement: 'Collection stores readings at most 600 seconds old at collection time.', domain: 'sensors', stage: 'collection',
  constraint: { metric: 'reading-age', operator: 'at-most', value: 600, unit: 'seconds' } };
export const consumer: ObligationDeclaration = { schemaVersion: 1, id: 'execution-age', role: 'requirement',
  endpoint: 'services/executor.ts', contract: readingContract,
  statement: 'Execution revalidates that readings are at most 60 seconds old at execution time.', domain: 'sensors', stage: 'execution',
  constraint: { metric: 'reading-age', operator: 'at-most', value: 60, unit: 'seconds' }, revalidation: 'required' };
export function document(declaration: ObligationDeclaration): string {
  return `# Public boundary\n\n\`\`\`weftlet-obligation\n${JSON.stringify(declaration, null, 2)}\n\`\`\`\n`;
}
/** Authored public declarations. No expected graph edges are injected into the fixture. */
export const obligationFiles: Readonly<Record<string, string>> = {
  '.gitignore': '.context-graph/\ncontext-graph.config.json\n', '.gitattributes': '* text eol=lf\n',
  'package.json': JSON.stringify({ name: 'public-obligation-example', private: true, type: 'module' }),
  'services/collector.ts': 'export function collect(observedAt: number, value: number) { return { observedAt, value }; }\n',
  'services/executor.ts': 'export function execute(reading: { observedAt: number }, now: number) { return now - reading.observedAt <= 60000; }\n',
  'services/scheduler.ts': 'export function schedule(key: string) { return { queue: "analyze", key }; }\n',
  'services/worker.ts': 'export function analyze(key: string) { return key.length; }\n',
  'services/worker.spec.ts': 'export const specification = "a consumer test is evidence, not a production component";\n',
  'services/billing.ts': 'export function report(value: number) { return value; }\n',
  'docs/collection.md': document(producer), 'docs/execution.md': document(consumer),
  'docs/queue-producer.md': document({ ...producer, id: 'schedule', endpoint: 'services/scheduler.ts', contract: queueContract,
    statement: 'Scheduler emits a key for analysis.', constraint: undefined } as ObligationDeclaration),
  'docs/queue-consumer.md': document({ schemaVersion: 1, id: 'analyze', role: 'requirement',
    endpoint: 'services/worker.ts', contract: queueContract, statement: 'Worker accepts analysis keys.' }),
  'docs/billing.md': document({ ...consumer, endpoint: 'services/billing.ts', contract: { ...readingContract, scope: 'billing' } }),
  'docs/unknown-version.md': document({ ...consumer, id: 'unknown-version', contract: { scope: 'sensor', id: 'readings', kind: 'stored-data' } }),
  'docs/missing.md': document({ ...consumer, endpoint: 'services/absent.ts' }),
  'docs/test-consumer.md': document({ ...consumer, endpoint: 'services/worker.spec.ts' }),
  'validation/check.md': document({ ...producer, id: 'not-product-intent' }),
  'provider.mjs': 'export function createSemanticExtractor() { return { identity: "public-obligation-empty:1", async extract() { return { parsed: { assertions: [], diagnostics: [], oml: "" }, rawModelOutput: "{}" }; } }; }\n',
};
