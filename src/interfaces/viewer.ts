import { createHostedAccess } from '../visualization/hosted-access.js';
import { createBundleExplorerService, createExplorerService } from '../application/explorer-service.js';
import { startExplorerServer } from '../visualization/explorer-server.js';
import { exportExplorerReport } from '../application/explorer-export.js';

function viewerArguments(args: readonly string[], operation: 'serve' | 'export') {
  const values = new Map<string, string>();
  const roots: string[] = [];
  const flags = ['--config', '--snapshot', '--source-url-template', ...(operation === 'serve' ? ['--port', '--bundle', '--expect-digest', '--max-bytes', '--public-origin']
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
  const bundle = values.get('--bundle'), digest = values.get('--expect-digest');
  const publicOrigin = values.get('--public-origin');
  if (publicOrigin && !bundle) throw Error('--public-origin requires --bundle');
  const hostedAccess = publicOrigin ? createHostedAccess(publicOrigin, process.env.WEFTLET_VIEWER_TOKEN) : undefined;
  if (bundle) {
    if (!digest || snapshotId || values.has('--config')) throw Error('viewer serve --bundle requires --expect-digest and selects its snapshot from the manifest; omit --config and --snapshot');
  } else {
    if (digest || (operation === 'serve' && values.has('--max-bytes'))) throw Error('--expect-digest and the serve byte limit require --bundle');
    if (!snapshotId) throw Error('viewer requires an exact --snapshot <id>');
  }
  if (operation === 'export' && (!roots.length || !values.get('--output'))) throw new Error('viewer export requires --node <exact-id> and a new --output <directory>');
  const port = values.has('--port') ? Number(values.get('--port')) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Invalid viewer port');
  const service = bundle ? await createBundleExplorerService(bundle, digest!, values.has('--max-bytes') ? Number(values.get('--max-bytes')) : undefined)
    : await createExplorerService(values.get('--config') ?? defaultConfig(), snapshotId!);
  if (operation === 'export') {
    const numeric = (flag: string) => values.has(flag) ? Number(values.get(flag)) : undefined;
    const result = await exportExplorerReport(service, { output: values.get('--output')!, roots,
      depth: numeric('--depth'), maxFacts: numeric('--max-facts'), maxNodes: numeric('--max-nodes'), maxBytes: numeric('--max-bytes'),
      sourceUrlTemplate: values.get('--source-url-template') });
    process.stdout.write(JSON.stringify(result) + '\n'); return true;
  }
  const server = await startExplorerServer(service, { port, hostedAccess,
    sourceUrlTemplate: values.get('--source-url-template') });
  process.stdout.write(JSON.stringify({ url: hostedAccess?.origin ?? server.url, ...(hostedAccess ? { listenUrl: server.url } : {}), snapshotId: service.index.snapshot.manifest.snapshotId, access: hostedAccess ? 'authenticated-proxy' : 'loopback-only', mode: 'read-only' }) + '\n');
  let closing = false;
  const stop = () => { if (closing) return; closing = true; void server.close().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Viewer shutdown failed'}\n`); process.exitCode = 1;
  }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return true;
}
