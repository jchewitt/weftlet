import { createExplorerService } from '../application/explorer-service.js';
import { startExplorerServer } from '../visualization/explorer-server.js';
import { exportExplorerReport } from '../application/explorer-export.js';

function viewerArguments(args: readonly string[], operation: 'serve' | 'export') {
  const values = new Map<string, string>();
  const roots: string[] = [];
  const flags = ['--config', '--snapshot', '--source-url-template', ...(operation === 'serve' ? ['--port']
    : ['--node', '--output', '--depth', '--max-facts', '--max-nodes', '--max-bytes'])];
  for (let i = 2; i < args.length; i++) {
    const flag = args[i]!, value = args[++i];
    if (!flags.includes(flag) || values.has(flag) || !value || value.startsWith('--')) throw new Error(`Invalid viewer argument: ${flag}`);
    if (flag === '--node') roots.push(value); else values.set(flag, value);
  }
  return { values, roots };
}

export async function runViewerCommand(args: readonly string[], defaultConfig: () => string): Promise<boolean> {
  if (args[0] !== 'viewer') return false;
  const operation = args[1];
  if (operation !== 'serve' && operation !== 'export') throw new Error('Use viewer serve --snapshot <id> or viewer export --snapshot <id> --node <exact-id> --output <directory>');
  const { values, roots } = viewerArguments(args, operation);
  const snapshotId = values.get('--snapshot');
  if (!snapshotId) throw new Error('viewer requires an exact --snapshot <id>');
  if (operation === 'export' && (!roots.length || !values.get('--output'))) throw new Error('viewer export requires --node <exact-id> and a new --output <directory>');
  const port = values.has('--port') ? Number(values.get('--port')) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Invalid viewer port');
  const service = await createExplorerService(values.get('--config') ?? defaultConfig(), snapshotId);
  if (operation === 'export') {
    const numeric = (flag: string) => values.has(flag) ? Number(values.get(flag)) : undefined;
    const result = await exportExplorerReport(service, { output: values.get('--output')!, roots,
      depth: numeric('--depth'), maxFacts: numeric('--max-facts'), maxNodes: numeric('--max-nodes'), maxBytes: numeric('--max-bytes'),
      sourceUrlTemplate: values.get('--source-url-template') });
    process.stdout.write(JSON.stringify(result) + '\n'); return true;
  }
  const server = await startExplorerServer(service, { port,
    sourceUrlTemplate: values.get('--source-url-template') });
  process.stdout.write(JSON.stringify({ url: server.url, snapshotId, access: 'loopback-only', mode: 'read-only' }) + '\n');
  let closing = false;
  const stop = () => { if (closing) return; closing = true; void server.close().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Viewer shutdown failed'}\n`); process.exitCode = 1;
  }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return true;
}
