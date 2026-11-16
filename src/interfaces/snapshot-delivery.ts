import { exportSnapshot } from '../application/delivery/export.js';
import { importSnapshot } from '../application/delivery/import.js';

export async function runSnapshotCommand(args: readonly string[], defaultConfig: () => string): Promise<boolean> {
  if (args[0] !== 'snapshot') return false;
  const operation = args[1];
  if (operation !== 'export' && operation !== 'import') throw Error('Use snapshot export or snapshot import');
  const flags = new Set(['--include-semantic', ...(operation === 'import' ? ['--activate', '--dry-run'] : [])]);
  const valued = new Set(['--config', '--max-bytes', ...(operation === 'export'
    ? ['--snapshot', '--output'] : ['--input', '--expect-digest', '--expect-head'])]);
  const values = new Map<string, string>(), selected = new Set<string>();
  for (let i = 2; i < args.length; i++) {
    const name = args[i]!;
    if (selected.has(name) || values.has(name)) throw Error(`Duplicate snapshot argument: ${name}`);
    if (flags.has(name)) selected.add(name);
    else if (valued.has(name) && args[i + 1] && !args[i + 1]!.startsWith('--')) values.set(name, args[++i]!);
    else throw Error(`Invalid snapshot argument: ${name}`);
  }
  const required = (name: string) => { const value = values.get(name); if (!value) throw Error(`snapshot ${operation} requires ${name}`); return value; };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const started = Date.now(); let lastPhase: string | undefined, lastLog = 0;
  const common = { signal: controller.signal, includeSemantic: selected.has('--include-semantic'),
    maxBytes: values.has('--max-bytes') ? Number(values.get('--max-bytes')) : undefined,
    onProgress: (event: { phase: string; completed?: number; total?: number }) => {
      const now = Date.now();
      if (event.phase !== lastPhase || now - lastLog >= 5000) {
        process.stderr.write(`[weftlet] ${event.phase} elapsedMs=${now - started}${event.completed === undefined ? '' : ` groups=${event.completed}/${event.total}`}\n`);
        lastPhase = event.phase; lastLog = now;
      }
    } };
  try {
    const config = values.get('--config') ?? defaultConfig();
    const report = operation === 'export'
      ? await exportSnapshot(config, { ...common, snapshotId: required('--snapshot'), output: required('--output') })
      : await importSnapshot(config, { ...common, input: required('--input'), expectDigest: required('--expect-digest'),
        activate: selected.has('--activate'), expectHead: values.get('--expect-head') === 'none' ? null : values.get('--expect-head'),
        dryRun: selected.has('--dry-run') });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  return true;
}
