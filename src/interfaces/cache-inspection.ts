import { resolve } from 'node:path';
import { inventoryCache } from '../storage/inspection/inventory.js';
import { profileSnapshot } from '../storage/inspection/profile.js';
import { cacheInspectionRoots, withInspectionSnapshot } from '../application/cache-inspection/context.js';

function parse(args: readonly string[]) {
  const operation = args[1];
  const flags = new Set(operation === 'usage' ? ['--json', '--verify', '--quiet'] : ['--json', '--quiet']);
  const valued = new Set(operation === 'usage' ? ['--root', '--config', '--max-entries', '--max-bytes']
    : ['--file', '--snapshot', '--config', '--max-bytes', '--max-record-bytes', '--max-distinct']);
  const values = new Map<string, string>(), selected = new Set<string>(), roots: string[] = [];
  for (let i = 2; i < args.length; i++) {
    const name = args[i]!;
    if (selected.has(name) || values.has(name)) throw Error(`Duplicate cache argument: ${name}`);
    if (flags.has(name)) selected.add(name);
    else if (valued.has(name) && args[i + 1] && !args[i + 1]!.startsWith('--')) {
      const value = args[++i]!;
      if (name === '--root') roots.push(resolve(value)); else values.set(name, value);
    } else throw Error(`Invalid cache ${operation} argument: ${name}`);
  }
  const number = (name: string) => {
    const value = values.get(name); if (value === undefined) return;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error(`${name} requires a positive safe integer`);
    return Number(value);
  };
  return { operation, values, selected, roots, number };
}
export async function runCacheInspection(args: readonly string[], defaultConfig: () => string): Promise<boolean> {
  if (args[0] !== 'cache' || !['usage', 'profile'].includes(args[1] ?? '')) return false;
  const { operation, values, selected, roots, number } = parse(args);
  validateSelection(operation, values, roots);
  const maxBytes = number('--max-bytes'), maxEntries = number('--max-entries');
  const maxRecordBytes = number('--max-record-bytes'), maxDistinct = number('--max-distinct');
  const controller = new AbortController(), cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let lastLog = 0;
  const progress = (done: number, total: number) => {
    if (selected.has('--quiet') || Date.now() - lastLog < 5000) return;
    lastLog = Date.now(); process.stderr.write(`[weftlet] cache-${operation} ${done}/${total} ${operation === 'usage' ? 'entries' : 'bytes'}\n`);
  };
  try {
    if (operation === 'usage') {
      const report = await inventoryCache({ roots: roots.length ? roots : await cacheInspectionRoots(values.get('--config')),
        verify: selected.has('--verify'), maxEntries, maxBytes, signal: controller.signal, onProgress: progress });
      process.stdout.write(selected.has('--json') ? JSON.stringify(report, null, 2) + '\n' :
        `Cache usage: ${report.totals.logicalBytes} logical bytes; ${report.totals.uniqueLogicalBytes} after observed hard-link deduplication.\n` +
        `${report.totals.allocatedKnownBytes} known allocated bytes; ${report.totals.allocatedUnknownEntries} entries with unknown allocation.\n` +
        `${report.totals.entries} entries across ${report.roots.length} roots; scan ${report.complete ? 'complete' : 'incomplete'}; dangling heads: ${report.danglingHeads.length}.\n` +
        Object.entries(report.byClass).map(([name, total]) => `${name}: ${total.entries} entries, ${total.logicalBytes} logical bytes`).join('\n') +
        '\nRead-only inventory; no deletion decisions. Use --json for object status, references and limitations; --verify for full JSON/byte reads.\n');
      if (!report.complete || report.danglingHeads.length || report.objects.some(entry => entry.inspection === 'invalid')) process.exitCode = 1;
    } else {
      const profile = (path: string) => profileSnapshot(path, { maxBytes, maxRecordBytes, maxDistinct, signal: controller.signal, onProgress: progress });
      const report = values.has('--file') ? await profile(resolve(values.get('--file')!)) :
        await withInspectionSnapshot(values.get('--config') ?? defaultConfig(), values.get('--snapshot')!, profile, { signal: controller.signal });
      process.stdout.write(selected.has('--json') ? JSON.stringify(report, null, 2) + '\n' :
        `Snapshot profile: ${report.physicalBytes} stored bytes; ${report.sections.facts?.records ?? 0} facts.\n` +
        Object.entries(report.sections).map(([name, section]) => `${name}: ${section.compactValueBytes} compact JSON value bytes`).join('\n') +
        '\nUse --json for field/repetition measurements and their limits. These are measurements, not guaranteed compression savings or a SHACL verdict.\n');
    }
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  return true;
}

function validateSelection(operation: string | undefined, values: Map<string, string>, roots: string[]) {
  if (roots.length && values.has('--config')) throw Error('Choose explicit --root values or --config, not both');
  if (operation === 'profile' && (values.has('--file') === values.has('--snapshot') || values.has('--file') && values.has('--config'))) {
    throw Error('cache profile requires either --file <snapshot.json> or --snapshot <id> [--config <file>]');
  }
}
