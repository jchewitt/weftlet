import { resolve } from 'node:path';
import { loadConfig } from '../../../configuration/config.js';
import { inspectSetupPath, contentDigest, type SetupFileChange } from '../files.js';
import { projectPath } from '../ci/project.js';
import { setupContract, setupLimits } from './contract.js';

export interface AssistedSetupOptions { directory?: string; configPath?: string; inputs: readonly string[] }
export function rejectSensitiveText(text: string) {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,})/.test(text) ||
    /(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*["']?\s*[:=]\s*["'][^$<{\s][^"']{7,}["']/i.test(text)) {
    throw Error('Selected setup input appears to contain credentials; provide a sanitized project file instead');
  }
}
function selectedPath(root: string, value: string) {
  const path = projectPath(root, value);
  if (/(^|\/)(?:\.git|node_modules|\.env[^/]*|\.npmrc|\.codex|\.claude|\.opencode|\.weftlet)(\/|$)/i.test(path) ||
      !(/\.(md|mdx|txt)$/i.test(path) || /(^|\/)package\.json$/.test(path) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))) {
    throw Error('Select Markdown/text documentation, package.json, or .github/workflows YAML inputs; credential/client/cache files are excluded');
  }
  return path;
}
function modelContent(path: string, raw: string) {
  if (!path.endsWith('package.json')) { rejectSensitiveText(raw); return raw; }
  let value;
  try { value = JSON.parse(raw); }
  catch { throw Error('Selected package manifest is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Selected package manifest must be an object');
  // Script bodies, registry URLs and arbitrary manifest properties are unnecessary for choosing script names.
  return JSON.stringify({ name: value.name, private: value.private, packageManager: value.packageManager,
    scripts: Object.keys(value.scripts ?? {}), workspaces: value.workspaces });
}
export async function inspectAssistedInputs(options: AssistedSetupOptions) {
  const root = resolve(options.directory ?? '.'), configPath = projectPath(root, options.configPath ?? 'context-graph.config.json');
  const configText = await inspectSetupPath(root, configPath);
  if (configText === null) throw Error('Run init first or select an existing --config');
  let loaded;
  try { loaded = await loadConfig(resolve(root, configPath)); }
  catch { throw Error('Invalid Weftlet configuration; validate it before assisted setup'); }
  const { config, repositoryRoot } = loaded;
  if (root !== repositoryRoot) throw Error('--directory must be the configured repository root');
  if (!options.inputs.length || options.inputs.length > setupLimits.files) throw Error(`Select 1–${setupLimits.files} explicit --input files`);
  const paths = options.inputs.map(path => selectedPath(root, path)).sort();
  if (new Set(paths).size !== paths.length || paths.includes(configPath)) throw Error('Duplicate input or config selected as raw input');
  const guards: SetupFileChange[] = [{ path: configPath, before: configText, after: configText }];
  const files = [];
  for (const path of paths) {
    const raw = await inspectSetupPath(root, path, setupLimits.fileBytes);
    if (raw === null) throw Error(`Selected setup input is missing: ${path}`);
    guards.push({ path, before: raw, after: raw });
    files.push({ path, sha256: contentDigest(raw), content: modelContent(path, raw) });
  }
  const selection = { semanticSources: config.semanticSources, approvedIntentSources: config.approvedIntentSources ?? [] };
  const input = { contract: setupContract, selection, files };
  const serialized = JSON.stringify(input);
  rejectSensitiveText(serialized);
  if (Buffer.byteLength(serialized) > setupLimits.inputBytes) throw Error(`Setup input exceeds ${setupLimits.inputBytes} bytes; select fewer/smaller files (nothing was truncated)`);
  return { root, configPath, config, guards, input,
    summary: { contract: setupContract, root, configPath, provider: config.semantic.provider, model: config.semantic.model,
      reasoningEffort: config.semantic.reasoningEffort, authentication: config.semantic.auth?.mode ?? 'existing-provider-login',
      timeoutMs: config.semantic.timeoutMs ?? 120_000, requests: 1, retries: 0, inputBytes: Buffer.byteLength(serialized),
      maxOutputBytes: setupLimits.outputBytes, selection,
      files: files.map(({ path, sha256, content }) => ({ path, sha256, sentBytes: Buffer.byteLength(content) })),
      configSha256: contentDigest(configText) } };
}
export type AssistedInputs = Awaited<ReturnType<typeof inspectAssistedInputs>>;
