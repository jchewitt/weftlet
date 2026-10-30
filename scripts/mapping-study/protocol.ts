import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from '../../src/infrastructure/util.js';

export type MappingState = 'explicit-indexed-binding' | 'explicit-test-binding' | 'declaration-only-binding' |
  'file-only-claim' | 'document-symbol-reference-only' | 'unresolved-selector' | 'intent-absent' | 'mapping-absent';
export interface MappingCase {
  readonly id: string; readonly ruleId: string; readonly document?: string;
  readonly targetPath: string; readonly targetName: string; readonly expected: MappingState;
  readonly predicate: 'implementedBy' | 'verifiedBy';
  readonly nextAction: string; readonly forbiddenNames?: readonly string[];
}
export interface MappingProtocol {
  readonly schemaVersion: 1; readonly baselineCommit: string;
  readonly purpose: string;
  readonly budget: { maxCases: number; maxFacts: number; maxPages: number; maxPaths: number; maxDepth: number; maxSteps: number };
  readonly cases: readonly MappingCase[];
}

/** Only explicitly inventoried public inputs can be copied or executed by this assessment. */
export async function readMappingInputs(root: string) {
  const lock = JSON.parse(await readFile(join(root, 'inputs.lock.json'), 'utf8')) as {
    schemaVersion: number; inputs: { path: string; sha256: string }[];
  };
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.inputs) || lock.inputs.length > 100 ||
      new Set(lock.inputs.map(input => input.path)).size !== lock.inputs.length) throw new Error('Invalid mapping-study inventory');
  const inputs = new Map<string, Buffer>();
  for (const input of lock.inputs) {
    if (!/^(?:protocol\.json|project\/[a-zA-Z0-9_.\/-]+)$/.test(input.path) ||
        input.path.split('/').some(part => ['', '.', '..', '.git', 'node_modules'].includes(part))) throw new Error('Unsafe mapping-study input');
    let path = root;
    for (const part of input.path.split('/')) {
      path = join(path, part);
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Symlink mapping-study input');
    }
    if (!(await lstat(path)).isFile()) throw new Error('Non-file mapping-study input');
    const bytes = await readFile(path);
    // Inputs explicitly declare LF, and Git may still check the inventory JSON out with CRLF.
    const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    if (sha256(normalized) !== input.sha256) throw new Error(`Mapping-study input changed: ${input.path}`);
    inputs.set(input.path, normalized);
  }
  if (!inputs.has('protocol.json') || !inputs.has('project/context-graph.config.json') || !inputs.has('project/provider.mjs')) {
    throw new Error('Missing required mapping-study input');
  }
  const protocol = JSON.parse(inputs.get('protocol.json')!.toString()) as MappingProtocol;
  const ceilings = { maxCases: 10, maxFacts: 25, maxPages: 8, maxPaths: 3, maxDepth: 4, maxSteps: 500 };
  for (const key of Object.keys(ceilings) as (keyof typeof ceilings)[]) {
    if (!Number.isInteger(protocol.budget[key]) || protocol.budget[key] < 1 || protocol.budget[key] > ceilings[key]) {
      throw new Error('Invalid mapping-study budget');
    }
  }
  if (protocol.schemaVersion !== 1 || protocol.cases.length !== 10 || protocol.cases.length > protocol.budget.maxCases ||
      new Set(protocol.cases.map(item => item.id)).size !== protocol.cases.length) throw new Error('Invalid mapping-study protocol');
  for (const item of protocol.cases) {
    if (!['implementedBy', 'verifiedBy'].includes(item.predicate)) throw new Error('Invalid mapping predicate');
    if (!inputs.has(`project/${item.targetPath}`) || (item.document && !inputs.has(`project/${item.document}`))) throw new Error('Uninventoried mapping case');
  }
  return { protocol, inputs, inventoryDigest: sha256(JSON.stringify(lock.inputs)) };
}
