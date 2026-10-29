/** Public input and acceptance expectations, independent of extracted graph output. */
export function codeEvidenceProject(): Record<string, string> {
  const lines = [
    'export function normalize(value: number) { return value < 0 ? 0 : value; }',
    'export function analyze(value: number) { return normalize(value) + normalize(value); }',
    'export function plan(value: number) { return analyze(value); }',
    'export function run(value: number) { return plan(value); }',
    'export function recursive(value: number): number { return value > 0 ? recursive(value - 1) : 0; }',
    'export function nested(value: number) { const same = (value: number) => normalize(value); return same(value); }',
    'export function unicode() { const label = "😀"; return normalize(label.length); }',
    'export function external(value: number) { return Math.round(value); }',
    'export class Engine {',
    '  private helper(value: number) { return normalize(value); }',
    '  execute(value: number) { return this.helper(value); }',
    '}',
    'export function overloaded(value: string): string;',
    'export function overloaded(value: number): number;',
    'export function overloaded(value: string | number) { return value; }',
    'export function useOverload() { return overloaded(1); }',
  ];
  // Long files may contain distant unrelated functions. Padding is explicit, not a claim
  // of production complexity or a benchmark of thousands of executable statements.
  while (lines.length < 2998) lines.push(`// Public fixture spacing ${lines.length + 1}`);
  lines.push('export function distantUnrelated(value: number) { return value * 2; }');
  return {
    '.gitattributes': '* text eol=lf\n',
    '.gitignore': '.context-graph/\ncontext-graph.config.json\n',
    'package.json': JSON.stringify({ name: 'public-code-evidence', version: '1.0.0', type: 'module' }),
    'src/large.ts': lines.join('\n') + '\n',
    'src/consumer.ts': "import { run } from './large.js';\nexport function consume(value: number) { return run(value); }\n",
    'src/unrelated.ts': 'export function other(value: number) { return Math.round(value); }\n',
    'test/mock.spec.ts': 'export function normalize(value: number) { return value; }\nexport function check(value: number) { return normalize(value); }\n',
  };
}

export const codeEvidenceExpectations = {
  lines: 3000, maxFacts: 300, maxHydrationMs: 60_000,
  chain: ['run', 'plan', 'analyze', 'normalize'],
  repeatedReferenceLine: 2,
} as const;
