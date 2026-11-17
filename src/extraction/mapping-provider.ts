import { runCodexStructuredRequest, type CodexStructuredRuntime } from './codex-request.js';
import { runOpenCodeStructuredRequest, type OpenCodeRuntime } from './opencode-request.js';
import { runClaudeStructuredRequest, type ClaudeRuntime } from './claude-request.js';
import type { MappingProposalProvider } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { resolveConsumerModule } from '../infrastructure/module-resolution.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { SemanticProviderError } from './semantic-process.js';
import { mappingOutputSchema } from './mapping-output.js';
import { mappingPrompt } from './mapping-prompt.js';
import { mappingVersion } from './mapping-request.js';

type Config = ContextGraphConfig['semantic'];
export interface MappingCodexRuntime extends CodexStructuredRuntime {
  readonly claude?: ClaudeRuntime;
  readonly opencode?: OpenCodeRuntime;
}
export const mappingProviderIdentity = (config: Config) => sha256(stableJson({ version: mappingVersion, provider: config.provider,
  model: config.model, reasoningEffort: config.reasoningEffort, providerModule: config.providerModule,
  providerIdentity: config.providerIdentity,
  ...(config.provider === 'opencode-cli' ? { cliContract: '1.19.5-v1' } : {}), authMode: config.auth?.mode ?? (config.provider === 'opencode-cli' ? 'opencode-auth' : config.provider === 'claude-cli' ? 'claude-login' : 'chatgpt') }));

/** Same selected provider/authentication choice as extraction; one bounded request, with no automatic retry. */
export function createMappingProvider(config: Config, repositoryRoot: string, runtime: MappingCodexRuntime = {}): MappingProposalProvider {
  const identity = mappingProviderIdentity(config);
  return { identity, async propose(input, options) {
    if (config.provider === 'module') {
      let factory;
      try { factory = (await import(resolveConsumerModule(config.providerModule!, repositoryRoot))).createMappingProposalProvider; }
      catch { throw new SemanticProviderError('unavailable', 'Mapping provider module could not be loaded'); }
      if (typeof factory !== 'function') throw new SemanticProviderError('unavailable', 'Module must export createMappingProposalProvider(config); semantic providers are not implicitly compatible');
      const provider = await factory(config);
      if (provider?.identity !== config.providerIdentity || typeof provider.propose !== 'function') throw new SemanticProviderError('unavailable', 'Mapping provider identity/contract mismatch');
      options.signal.throwIfAborted();
      return provider.propose(input, options);
    }
    if (config.provider === 'claude-cli') return runClaudeStructuredRequest(config, mappingOutputSchema,
      mappingPrompt(input), 131_072, options, runtime.claude);
    if (config.provider === 'opencode-cli') return runOpenCodeStructuredRequest(config, mappingOutputSchema,
      mappingPrompt(input), 131_072, options, runtime.opencode);
    return runCodexStructuredRequest(config, mappingOutputSchema, mappingPrompt(input), 131_072, options, runtime);
  } };
}
