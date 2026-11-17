import type { ContextGraphConfig } from '../../../configuration/config.js';
import { supportedOpenCodeVersion } from '../../../extraction/opencode-profile.js';
import type { CiSetupOptions } from './project.js';

const profiles = {
  'codex-cli': { package: '@openai/codex', command: 'codex', defaultKey: 'CODEX_API_KEY' },
  'claude-cli': { package: '@anthropic-ai/claude-code', command: 'claude', defaultKey: 'ANTHROPIC_API_KEY' },
  'opencode-cli': { package: 'opencode-ai', command: 'opencode', defaultKey: 'WEFTLET_OPENCODE_API_KEY' },
};
function providerPin(provider: ContextGraphConfig['semantic']['provider'], version: string | undefined) {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw Error('Pin the reviewed extraction CLI using --provider-version <exact-version>');

  if (provider === 'module') throw Error('Custom module providers need a reviewed manual generation workflow; no CLI is guessed');
  if (provider === 'opencode-cli' && version !== supportedOpenCodeVersion) throw Error(`OpenCode extraction currently requires ${supportedOpenCodeVersion}`);
  if (provider === 'claude-cli') {
    const [major, minor, patch] = version.split('.').map(Number);
    if (major !== 2 || minor! < 1 || (minor === 1 && patch! < 321)) throw Error('Claude extraction requires version 2.1.321 or later within major 2');
  }
  return { ...profiles[provider], provider, version };
}
function credential(config: ContextGraphConfig, runner: CiSetupOptions['runner'], defaultKey: string) {
  const api = config.semantic.auth?.mode === 'api-key';
  if (runner === 'hosted' && !api) throw Error('Hosted generation requires an explicitly selected api-key config. Keep account/saved login with --runner self-hosted; setup never changes authentication mode.');
  const apiKeyEnv = api ? (config.semantic.auth as { apiKeyEnv?: string }).apiKeyEnv ?? defaultKey : undefined;
  if (apiKeyEnv && (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv) || /^(?:GITHUB_|RUNNER_|ACTIONS_|NODE_|LD_|DYLD_|NPM_|npm_|PNPM_|BASH_|SHELL|PATH$|HOME$|ENV$|BASH_ENV$|IFS$|CDPATH$|PYTHON|RUBY|PERL)/i.test(apiKeyEnv))) {
    throw Error('Use a dedicated credential variable rather than a process/runner configuration variable');
  }
  return { api, apiKeyEnv };
}
export function generationProfile(config: ContextGraphConfig, options: CiSetupOptions) {
  if (!options.generate) return undefined;
  if (!options.environment || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(options.environment)) throw Error('Trusted generation requires --environment <GitHub-environment-name>');
  if (!['hosted', 'self-hosted'].includes(options.runner ?? '')) throw Error('Trusted generation requires --runner hosted or self-hosted');
  const profile = providerPin(config.semantic.provider, options.providerVersion);
  const { provider } = profile;
  const { api, apiKeyEnv } = credential(config, options.runner, profile.defaultKey);
  if (!config.semantic.maxDocuments || !config.semantic.maxSourceBytes) throw Error('Set explicit semantic.maxDocuments and semantic.maxSourceBytes limits before generation setup');
  return { ...profile, runner: options.runner!, environment: options.environment, apiKeyEnv,
    authentication: api ? 'api-key' : config.semantic.auth?.mode ?? (provider === 'codex-cli' ? 'chatgpt' : provider === 'claude-cli' ? 'claude-login' : 'opencode-auth') };
}
export type GenerationProfile = NonNullable<ReturnType<typeof generationProfile>>;
