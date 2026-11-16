export const setupContract = 'weftlet-setup-plan-v1';
export const setupLimits = { files: 24, inputBytes: 131_072, outputBytes: 65_536, fileBytes: 65_536 } as const;
export interface SetupRecommendation {
  explanation: string;
  semanticSources: string[] | null;
  approvedIntentSources: string[] | null;
  clients: ('codex' | 'claude' | 'opencode')[];
  mcp: boolean;
  ci: { workingDirectory: string; buildScript: string | null; testScripts: string[]; existingWorkflow: string | null } | null;
  notes: string[];
}
const strings = { type: 'array', items: { type: 'string' } };
export const setupOutputSchema = {
  type: 'object', additionalProperties: false,
  required: ['explanation', 'semanticSources', 'approvedIntentSources', 'clients', 'mcp', 'ci', 'notes'],
  properties: {
    explanation: { type: 'string' }, semanticSources: { anyOf: [strings, { type: 'null' }] },
    approvedIntentSources: { anyOf: [strings, { type: 'null' }] },
    clients: { type: 'array', items: { type: 'string', enum: ['codex', 'claude', 'opencode'] } }, mcp: { type: 'boolean' },
    ci: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false,
      required: ['workingDirectory', 'buildScript', 'testScripts', 'existingWorkflow'], properties: {
        workingDirectory: { type: 'string' }, buildScript: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        testScripts: strings, existingWorkflow: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      } }] }, notes: strings,
  },
};
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw Error('Invalid setup response object/fields');
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 2_000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw Error('Invalid setup response text');
}
function list(value: unknown, max = 24): asserts value is string[] {
  if (!Array.isArray(value) || value.length > max) throw Error('Invalid setup response list');
  value.forEach(text);
  if (new Set(value).size !== value.length) throw Error('Duplicate setup response entries');
}
export function validateRecommendation(value: unknown): SetupRecommendation {
  record(value, ['explanation', 'semanticSources', 'approvedIntentSources', 'clients', 'mcp', 'ci', 'notes']);
  text(value.explanation); list(value.notes, 16); list(value.clients, 3);
  if (value.clients.some(client => !['codex', 'claude', 'opencode'].includes(client)) || typeof value.mcp !== 'boolean' ||
    (value.mcp && !value.clients.length)) throw Error('Invalid setup client selection');
  if (value.semanticSources !== null) list(value.semanticSources);
  if (value.approvedIntentSources !== null) list(value.approvedIntentSources);
  if (value.ci !== null) {
    record(value.ci, ['workingDirectory', 'buildScript', 'testScripts', 'existingWorkflow']);
    text(value.ci.workingDirectory); list(value.ci.testScripts, 12);
    if (value.ci.buildScript !== null) text(value.ci.buildScript);
    if (value.ci.existingWorkflow !== null) text(value.ci.existingWorkflow);
  }
  return value as unknown as SetupRecommendation;
}
