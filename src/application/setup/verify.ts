import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolveImport } from 'import-meta-resolve';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareMcpSetup } from './mcp.js';
import { planSkillSetup } from './skills.js';
import type { ProjectSetupOptions } from './project.js';

const requiredTools = ['impact.scan', 'graph.catalog', 'graph.fact', 'graph.neighbors', 'graph.paths',
  'graph.compatibility', 'graph.coverage', 'mapping.plan', 'mapping.proposals'];

async function installedVersion(root: string): Promise<string> {
  try {
    const entry = fileURLToPath(resolveImport('@weftlet/toolkit', pathToFileURL(resolve(root, 'package.json')).href));
    const manifest = JSON.parse(await readFile(resolve(dirname(entry), '..', 'package.json'), 'utf8'));
    if (manifest.name !== '@weftlet/toolkit' || typeof manifest.version !== 'string') throw Error();
    return manifest.version;
  } catch { throw Error('Install @weftlet/toolkit as a dependency in this project, then rerun setup --verify.'); }
}

async function skillStatuses(options: ProjectSetupOptions) {
  if (options.skills === false) return undefined;
  const skill = await planSkillSetup(options);
  return skill.files.map(file => ({ client: file.client, path: file.path,
    status: file.action === 'unchanged' ? 'installed' : file.action === 'create' ? 'missing' : file.action === 'conflict' ? 'customized-review' : 'update-available' }));
}

/** A protocol probe, not a model call. Starting MCP loads the project's configured trusted adapter. */
export async function verifyProjectSetup(options: ProjectSetupOptions, snapshotId?: string) {
  if (snapshotId !== undefined && (!snapshotId || snapshotId.length > 256)) throw Error('--snapshot requires an ID of 1–256 characters');
  const skills = await skillStatuses(options);
  const prepared = await prepareMcpSetup(options);
  const registrations = prepared.plan.registrations.map(item => ({ client: item.client, path: item.path, status: item.action }));
  const base = { skills, registrations, clientLoading: 'Requires client restart/trust and an in-client tool check; not tested by this probe.' };
  if (prepared.plan.launcher.action !== 'unchanged' || registrations.some(item => item.status !== 'unchanged')) {
    return { ...base, passed: false, server: { status: 'not-started', message: 'Apply/review the MCP setup plan first. Only the expected generated launcher is verified.' }, snapshot: { status: 'not-queried' } };
  }
  const expectedVersion = await installedVersion(prepared.plan.root);
  const client = new Client({ name: 'weftlet-setup-verifier', version: expectedVersion });
  const transport = new StdioClientTransport({ command: prepared.command, args: prepared.args,
    cwd: prepared.plan.root, env: Object.fromEntries(Object.entries({ ...process.env, CONTEXT_GRAPH_MCP_TEST: '0' })
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')), stderr: 'pipe', maxBufferSize: 1_048_576 });
  // Drain diagnostics without retaining or echoing adapter output (which can contain private data).
  transport.stderr?.on('data', () => {});
  let protocolError = false;
  client.onerror = () => { protocolError = true; };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  timer.unref();
  try {
    await client.connect(transport, { signal: controller.signal, timeout: 15_000 });
    const server = client.getServerVersion();
    const tools = await client.listTools({}, { signal: controller.signal, timeout: 15_000 });
    const missingTools = requiredTools.filter(name => !tools.tools.some(tool => tool.name === name));
    if (protocolError || server?.name !== 'context-graph' || server.version !== expectedVersion || missingTools.length) {
      return { ...base, passed: false, server: { status: 'protocol-mismatch', expectedVersion, missingTools,
        message: 'MCP identity, tools or protocol stdout did not match the installed toolkit. Check installation and adapter diagnostics locally.' }, snapshot: { status: 'not-queried' } };
    }
    let snapshot: { status: string; message?: string } = { status: 'not-requested' };
    if (snapshotId) {
      const result = await client.callTool({ name: 'graph.catalog', arguments: { snapshotId, maxNodes: 1 } }, undefined,
        { signal: controller.signal, timeout: 15_000 });
      snapshot = result.isError ? { status: 'unavailable', message: 'The exact saved snapshot could not be queried. Check its ID and configured storage with graph catalog; setup does not rebuild it.' } : { status: 'readable' };
    }
    return { ...base, passed: !protocolError && snapshot.status !== 'unavailable' && (skills?.every(item => item.status === 'installed') ?? true),
      server: { status: 'ready', name: server.name, version: server.version, toolCount: tools.tools.length }, snapshot };
  } catch {
    return { ...base, passed: false, server: { status: controller.signal.aborted ? 'timeout' : 'startup-failed',
      message: 'MCP verification failed within its 15-second deadline. Check the project Node installation, config and trusted adapter locally; no model or hydration was requested.' }, snapshot: { status: 'not-queried' } };
  } finally {
    clearTimeout(timer);
    await client.close();
    await transport.close();
  }
}
