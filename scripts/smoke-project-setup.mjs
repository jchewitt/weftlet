import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse as parseToml } from 'smol-toml';

const execute = promisify(execFile);
/** Verify shipped config/launcher assets in the independently installed npm consumer. */
export async function smokeProjectSetup(project, version, snapshotId) {
  const clients = ['--client', 'codex', '--client', 'claude', '--client', 'opencode'];
  const run = async (root, ...args) => JSON.parse((await execute(process.execPath,
    [join(root, 'node_modules/@weftlet/toolkit/dist/cli.js'), 'setup', '--directory', root, ...clients, '--mcp', '--json', ...args],
    { cwd: dirname(root), timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })).stdout);
  const preview = await run(project);
  if (!preview.ready || preview.applied) throw Error('Packed MCP setup preview failed');
  const applied = await run(project, '--apply', '--expect-plan', preview.planId, '--verify', ...(snapshotId ? ['--snapshot', snapshotId] : []));
  if (!applied.verification.passed || applied.verification.server.version !== version ||
      applied.verification.snapshot.status !== (snapshotId ? 'readable' : 'not-requested')) throw Error('Packed setup/MCP verification failed');
  try { await run(project, '--verify', '--snapshot', 'not-a-saved-snapshot'); throw Error('Missing snapshot must fail verification'); }
  catch (error) {
    const result = JSON.parse(error.stdout ?? '{}');
    if (result.verification?.server.status !== 'ready' || result.verification?.snapshot.status !== 'unavailable') throw error;
  }
  const configPath = join(project, 'context-graph.config.json');
  const configBefore = await readFile(configPath, 'utf8');
  const brokenAdapter = join(project, 'setup-probe-adapter.mjs');
  try {
    await writeFile(configPath, JSON.stringify({ ...JSON.parse(configBefore), adapter: './setup-probe-adapter.mjs' }));
    for (const [code, status] of [
      ["console.log('PRIVATE_STDOUT_SENTINEL'); export function createContextGraphAdapter() { return { factExtractors: [], invariantEvaluators: [] }; }", 'protocol-mismatch'],
      ["console.error('PRIVATE_STDERR_SENTINEL'); throw Error('PRIVATE_ERROR_SENTINEL');", 'startup-failed'],
    ]) {
      await writeFile(brokenAdapter, code);
      let failed;
      try { await run(project, '--verify'); } catch (error) { failed = error; }
      const result = JSON.parse(failed?.stdout ?? '{}');
      if (result.verification?.server.status !== status || /PRIVATE_/.test(`${failed?.stdout}${failed?.stderr}`)) {
        throw Error('Verification must reject broken/noisy MCP startup without exposing adapter output');
      }
    }
  } finally {
    await writeFile(configPath, configBefore);
    await rm(brokenAdapter, { force: true });
  }
  const repeat = await run(project, '--apply');
  if (repeat.mcp.registrations.some(item => item.action !== 'unchanged') || repeat.skill.files.some(item => item.action !== 'unchanged')) {
    throw Error('Repeated packed setup must be unchanged');
  }
  const probeClients = async (root, cwd) => {
    const codex = parseToml(await readFile(join(root, '.codex/config.toml'), 'utf8')).mcp_servers.weftlet;
    const claude = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8')).mcpServers.weftlet;
    const opencode = JSON.parse(await readFile(join(root, 'opencode.json'), 'utf8')).mcp.weftlet;
    for (const entry of [codex, claude, { command: opencode.command[0], args: opencode.command.slice(1) }]) {
      const client = new Client({ name: 'packed-generated-launcher', version: '1.0.0' });
      const transport = new StdioClientTransport({ ...entry, cwd, stderr: 'pipe', env: { ...process.env, CONTEXT_GRAPH_CONFIG: 'must-be-overridden' } });
      transport.stderr?.on('data', () => {});
      try {
        await client.connect(transport, { timeout: 15_000 });
        if (client.getServerVersion()?.version !== version || !(await client.listTools()).tools.some(tool => tool.name === 'impact.scan')) {
          throw Error('Generated client registration did not discover the installed MCP server');
        }
      } finally { await client.close(); await transport.close(); }
    }
  };
  const nested = join(project, 'nested directory', 'child');
  await mkdir(nested, { recursive: true });
  await probeClients(project, nested);
  // Move the whole independent consumer, proving committed portable settings contain no old absolute checkout path.
  const relocated = `${project}-relocated`;
  await rename(project, relocated);
  try {
    await probeClients(relocated, join(relocated, 'nested directory/child'));
    if (!(await run(relocated, '--verify')).verification.passed) throw Error('Relocated setup verification failed');
  } finally { await rename(relocated, project); }
  const absolute = await run(project, '--absolute-launcher', '--update');
  await run(project, '--absolute-launcher', '--update', '--apply', '--expect-plan', absolute.planId);
  await probeClients(project, dirname(project));
  // Restore portable settings for the caller's remaining smoke checks.
  await run(project, '--update', '--apply');
}
