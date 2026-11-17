import { isAbsolute, relative, resolve } from 'node:path';
import { loadConfig } from '../../configuration/config.js';
import { toolkitIdentity } from '../../infrastructure/package-identity.js';
import { contentDigest, inspectSetupPath, type SetupFileChange } from './files.js';
import { mergeMcpConfiguration, type EntryReceipt, type McpEntry } from './mcp-config.js';
import { projectMcpLauncher } from './mcp-launcher.js';
import { parseSkillClients, type SkillClient, type SkillSetupOptions } from './skills.js';

export interface McpSetupOptions extends SkillSetupOptions {
  configPath?: string;
  absoluteLauncher?: boolean;
}
interface Receipt {
  schemaVersion: 1;
  entries: Partial<Record<SkillClient, EntryReceipt & { path: string }>>;
  launchers: Record<string, string>;
}
const receiptPath = '.weftlet/mcp-setup.json';
function readReceipt(text: string | null): Receipt {
  if (text === null) return { schemaVersion: 1, entries: {}, launchers: {} };
  try {
    const value = JSON.parse(text);
    const object = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (value.schemaVersion !== 1 || !object(value.entries) || !object(value.launchers)) throw Error();
    for (const [client, entry] of Object.entries(value.entries)) {
      if (!['codex', 'claude', 'opencode'].includes(client) || !object(entry)) throw Error();
      const item = entry as EntryReceipt & { path: string };
      if (typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.entrySha256) ||
          (item.blockSha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.blockSha256))) throw Error();
    }
    if (Object.values(value.launchers).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) throw Error();
    return value;
  } catch { throw Error('Invalid .weftlet/mcp-setup.json receipt; review it before setup. No files written.'); }
}

async function clientPath(root: string, client: SkillClient): Promise<string> {
  if (client === 'codex') return '.codex/config.toml';
  if (client === 'claude') return '.mcp.json';
  const json = await inspectSetupPath(root, 'opencode.json');
  const jsonc = await inspectSetupPath(root, 'opencode.jsonc');
  if (json !== null && jsonc !== null) throw Error('Both opencode.json and opencode.jsonc exist; resolve configuration precedence before setup.');
  return jsonc !== null ? 'opencode.jsonc' : 'opencode.json';
}

async function projectConfiguration(options: McpSetupOptions) {
  const root = resolve(options.directory ?? '.');
  const absoluteConfig = resolve(root, options.configPath ?? 'context-graph.config.json');
  const configPath = relative(root, absoluteConfig).replaceAll('\\', '/');
  if (!configPath || isAbsolute(configPath) || configPath.split('/').includes('..')) throw Error('MCP configuration must be inside the project');
  const configBytes = await inspectSetupPath(root, configPath);
  if (configBytes === null) throw Error('Weftlet configuration is missing. Run weftlet init first, or specify --config.');
  let loaded;
  try { loaded = await loadConfig(absoluteConfig, root); }
  catch { throw Error('Invalid Weftlet configuration; run weftlet config validate before MCP setup.'); }
  if (loaded.repositoryRoot !== root) throw Error('--directory must be the configured repository root');
  return { root, configPath, configBytes, repositoryId: loaded.config.repositoryId };
}

/** Raw settings stay internal to compare-and-swap writes; public plans contain only digests. */
export async function prepareMcpSetup(options: McpSetupOptions) {
  const { root, configPath, configBytes, repositoryId } = await projectConfiguration(options);
  const clients = parseSkillClients(options.clients);
  const identity = await toolkitIdentity();
  const launcher = projectMcpLauncher(repositoryId, configPath);
  const receiptBefore = await inspectSetupPath(root, receiptPath);
  const receipt = readReceipt(receiptBefore);
  const launcherBefore = await inspectSetupPath(root, launcher.path);
  const launcherAction = launcherBefore === launcher.content ? 'unchanged' : launcherBefore === null ? 'create' :
    receipt.launchers[launcher.path] === contentDigest(launcherBefore) ? (options.update ? 'update' : 'update-available') : 'conflict';
  const command = options.absoluteLauncher ? process.execPath : 'node';
  const args = options.absoluteLauncher ? [resolve(root, launcher.path)] : ['-e', launcher.bootstrap];
  const changes: SetupFileChange[] = [{ path: configPath, before: configBytes, after: configBytes },
    { path: launcher.path, before: launcherBefore, after: launcher.content }];
  const registrations = [];
  for (const client of clients) {
    const path = await clientPath(root, client);
    const before = await inspectSetupPath(root, path);
    const entry: McpEntry = client === 'opencode' ? { type: 'local', command: [command, ...args], enabled: true } : { command, args };
    const previous = receipt.entries[client];
    const result = mergeMcpConfiguration(client, before, entry, previous?.path === path ? previous : undefined, options.update);
    changes.push({ path, before, after: result.after });
    if (result.receipt) receipt.entries[client] = { path, ...result.receipt };
    registrations.push({ client, path, action: result.action, entry });
  }
  receipt.launchers[launcher.path] = contentDigest(launcher.content);
  changes.push({ path: receiptPath, before: receiptBefore, after: `${JSON.stringify(receipt, null, 2)}\n` });
  if (new Set(changes.map(change => change.path)).size !== changes.length) throw Error('Weftlet configuration collides with an MCP setup file');
  const ready = [launcherAction, ...registrations.map(item => item.action)].every(action => !['conflict', 'update-available'].includes(action));
  const files = changes.map(({ path, before, after }) => ({ path,
    beforeSha256: before === null ? null : contentDigest(before), afterSha256: contentDigest(after) }));
  const plan = { schemaVersion: 1, root, packageVersion: identity.version, ready, configPath,
    launcher: { path: launcher.path, action: launcherAction, mode: options.absoluteLauncher ? 'absolute' : 'project-relative' }, registrations, files };
  return { plan: { ...plan, planId: contentDigest(JSON.stringify(plan)) }, changes, command, args };
}
