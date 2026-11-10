import { resolveCliInvocation } from './cli-command.js';
import type { SemanticRunOptions } from './semantic-process.js';

/** Retains the Codex launcher contract while sharing platform discovery. */
export function resolveCodexInvocation(command: string, environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform, options: SemanticRunOptions = {}) {
  return resolveCliInvocation('codex', '@openai/codex', 'Codex', command, environment, platform, options);
}
