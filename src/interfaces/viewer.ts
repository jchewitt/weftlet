import { createExplorerService } from '../application/explorer-service.js';
import { startExplorerServer } from '../visualization/explorer-server.js';

export async function runViewerCommand(args: readonly string[], defaultConfig: () => string): Promise<boolean> {
  if (args[0] !== 'viewer') return false;
  if (args[1] !== 'serve') throw new Error('Use viewer serve --snapshot <id> [--config <file>] [--port <port>]');
  const values = new Map<string, string>();
  const flags = ['--config', '--snapshot', '--port', '--source-url-template'];
  for (let i = 2; i < args.length; i++) {
    const flag = args[i]!, value = args[++i];
    if (!flags.includes(flag) || values.has(flag) || !value || value.startsWith('--')) throw new Error(`Invalid viewer argument: ${flag}`);
    values.set(flag, value);
  }
  const snapshotId = values.get('--snapshot');
  if (!snapshotId) throw new Error('viewer serve requires an exact --snapshot <id>');
  const port = values.has('--port') ? Number(values.get('--port')) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Invalid viewer port');
  const service = await createExplorerService(values.get('--config') ?? defaultConfig(), snapshotId);
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
