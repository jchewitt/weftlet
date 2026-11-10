import { join } from 'node:path';
import { semanticCommandEnvironment } from './semantic-environment.js';
import type { ContextGraphConfig } from '../configuration/config.js';
import { SemanticProviderError } from './semantic-process.js';

export const supportedOpenCodeVersion = '1.19.5';
export function openCodeBackend(model: string): string {
  const match = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)\/\S+$/.exec(model);
  if (!match) throw new SemanticProviderError('unavailable', 'OpenCode requires an explicit provider/model identifier');
  return match[1]!;
}

/** This pinned CLI contract isolates settings, sessions, logs and caches without changing HOME. */
export function openCodeEnvironment(root: string, source: Readonly<Record<string, string | undefined>>) {
  const env = semanticCommandEnvironment(source);
  delete env.CODEX_HOME;
  for (const name of ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']) env[name] = join(root, name.toLowerCase());
  Object.assign(env, {
    OPENCODE_TEST_HOME: root, OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
    OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_EXTERNAL_SKILLS: 'true',
    OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: 'true',
    OPENCODE_AUTH_CONTENT: '{}', OPENCODE_PERMISSION: '{"*":"deny"}', OPENCODE_PURE: 'true',
  });
  return env;
}

export function openCodeProfile(config: ContextGraphConfig['semantic']) {
  return {
    model: config.model, enabled_providers: [openCodeBackend(config.model)], default_agent: 'weftlet',
    agent: {
      weftlet: { mode: 'primary', description: 'Bounded Weftlet structured extraction', permission: { '*': 'deny' }, steps: 1 },
      title: { disable: true }, summary: { disable: true }, compaction: { disable: true },
    },
    permission: { '*': 'deny' }, share: 'disabled', snapshot: false, autoupdate: false,
    instructions: [], mcp: {}, plugin: [], lsp: false, formatter: false,
  };
}
