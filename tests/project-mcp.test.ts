import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, it } from 'vitest';
import { initializeProject } from '../src/interfaces/init.js';
import { applyProjectSetup, planProjectSetup, type ProjectSetupOptions } from '../src/application/setup/project.js';
import { verifyProjectSetup } from '../src/application/setup/verify.js';
import { toolkitIdentity } from '../src/infrastructure/package-identity.js';

it('starts the built project toolkit through generated commands from nested/relocated and outside directories', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'weftlet project mcp '));
  const original = join(workspace, 'consumer');
  const moved = join(workspace, 'relocated consumer');
  let root = original;
  try {
    await initializeProject({ directory: root, clients: [] });
    await mkdir(join(root, 'node_modules/@weftlet'), { recursive: true });
    await symlink(resolve(import.meta.dirname, '..'), join(root, 'node_modules/@weftlet/toolkit'), process.platform === 'win32' ? 'junction' : 'dir');
    const options = (): ProjectSetupOptions => ({ directory: root, clients: ['codex', 'claude', 'opencode'], mcp: true });
    const apply = async (extra = {}) => {
      const input = { ...options(), ...extra }, plan = await planProjectSetup(input);
      await applyProjectSetup(input, plan.planId); return plan;
    };
    let plan = await apply();
    const probe = async (cwd: string) => {
      for (const registration of plan.mcp!.registrations) {
        const entry = registration.entry;
        const command = Array.isArray(entry.command) ? entry.command[0] : entry.command;
        const args = Array.isArray(entry.command) ? entry.command.slice(1) : entry.args;
        const client = new Client({ name: 'project-setup-test', version: '1.0.0' });
        const transport = new StdioClientTransport({ command: command as string, args: args as string[], cwd, stderr: 'pipe' });
        transport.stderr?.on('data', () => {});
        try {
          await client.connect(transport, { timeout: 15_000 });
          expect(client.getServerVersion()).toEqual({ name: 'context-graph', version: (await toolkitIdentity()).version });
          expect((await client.listTools()).tools.map(tool => tool.name)).toContain('impact.scan');
        } finally { await client.close(); await transport.close(); }
      }
    };
    await mkdir(join(root, 'nested', 'child'), { recursive: true });
    await probe(join(root, 'nested', 'child'));
    await rename(root, moved); root = moved;
    await probe(join(root, 'nested', 'child'));
    const verified = await verifyProjectSetup(options());
    expect(verified.passed).toBe(true);
    expect(verified.snapshot.status).toBe('not-requested');
    const missing = await verifyProjectSetup(options(), 'missing');
    expect(missing.passed).toBe(false);
    expect(missing.server.status).toBe('ready');
    expect(missing.snapshot.status).toBe('unavailable');
    plan = await apply({ absoluteLauncher: true, update: true });
    await probe(workspace);
    // Prove the verifier does not execute a customized launcher.
    await writeFile(join(root, plan.mcp!.launcher.path), "throw Error('must not execute');\n");
    expect((await verifyProjectSetup({ ...options(), absoluteLauncher: true })).server.status).toBe('not-started');
  } finally { await rm(workspace, { recursive: true, force: true }); }
}, 180_000);
