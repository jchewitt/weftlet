export type HistoryChoice = { mode: 'indefinite' } | { mode: 'target'; maxBytes: number };
export type HistoryPolicy = { mode: 'indefinite' } | { mode: 'target'; maxBytes: number; repositories?: ({ repositoryId: string } & HistoryChoice)[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function choice(value: unknown, extra: string[] = []): asserts value is Record<string, unknown> & HistoryChoice {
  if (!record(value) || !['target', 'indefinite'].includes(String(value.mode))) throw Error('History retention requires target or indefinite mode');
  const allowed = ['mode', ...extra, ...(value.mode === 'target' ? ['maxBytes'] : [])];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unknown history retention field');
  if (value.mode === 'target' && (!Number.isSafeInteger(value.maxBytes) || Number(value.maxBytes) < 0)) throw Error('History maxBytes must be a nonnegative safe integer');
}
export function parseHistoryPolicy(input: unknown, repositories: ReadonlySet<string>): HistoryPolicy {
  choice(input, record(input) && input.mode === 'target' ? ['repositories'] : []);
  if (input.mode === 'indefinite') return input as HistoryPolicy;
  if (input.repositories !== undefined) {
    if (!Array.isArray(input.repositories) || input.repositories.length > 5000) throw Error('History repository overrides must be a bounded array');
    const seen = new Set<string>();
    for (const item of input.repositories) {
      choice(item, ['repositoryId']);
      if (typeof item.repositoryId !== 'string' || !repositories.has(item.repositoryId) || seen.has(item.repositoryId)) throw Error('History override requires one exact declared repository ID');
      seen.add(item.repositoryId);
    }
  }
  return input as HistoryPolicy;
}
