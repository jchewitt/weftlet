import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MappingProposalProvider } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { resolveConsumerModule } from '../infrastructure/module-resolution.js';
import { sha256, stableJson } from '../infrastructure/util.js';
import { prepareCodexAuthentication } from './codex-auth.js';
import { resolveCodexInvocation } from './codex-command.js';
import { runSemanticProcess, SemanticProviderError } from './semantic-process.js';
import { mappingOutputSchema } from './mapping-output.js';
import { mappingPrompt } from './mapping-prompt.js';
import { mappingVersion } from './mapping-request.js';

type Config = ContextGraphConfig['semantic'];
export interface MappingCodexRuntime {
  readonly authenticate?: typeof prepareCodexAuthentication;
  readonly invocation?: typeof resolveCodexInvocation;
  readonly run?: typeof runSemanticProcess;
}
export const mappingProviderIdentity = (config: Config) => sha256(stableJson({ version: mappingVersion, provider: config.provider,
  model: config.model, reasoningEffort: config.reasoningEffort, providerModule: config.providerModule,
  providerIdentity: config.providerIdentity, authMode: config.auth?.mode ?? 'chatgpt' }));

/** Same Codex authentication choice as extraction; one bounded request, with no automatic retry. */
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
    const command = 'codex';
    const env = await (runtime.authenticate ?? prepareCodexAuthentication)(config.auth, process.env, command, options);
    const invocation = await (runtime.invocation ?? resolveCodexInvocation)(command, env, process.platform, options);
    options.signal.throwIfAborted();
    const root = await mkdtemp(join(tmpdir(), 'weftlet-mapping-'));
    try {
      const schema = join(root, 'schema.json'), output = join(root, 'output.json');
      await writeFile(schema, JSON.stringify(mappingOutputSchema));
      const args = ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
        '--disable', 'shell_tool', '--cd', root, '--sandbox', 'read-only', '--model', config.model,
        '-c', `model_reasoning_effort="${config.reasoningEffort}"`, '--output-schema', schema, '--output-last-message', output, '-'];
      await (runtime.run ?? runSemanticProcess)(invocation.command, [...invocation.prefixArgs, ...args], root, mappingPrompt(input), env, options);
      if ((await stat(output)).size > 131_072) throw new SemanticProviderError('invalid-output', 'Mapping output exceeds 128 KiB');
      try { return JSON.parse(await readFile(output, 'utf8')); }
      catch { throw new SemanticProviderError('invalid-output', 'Mapping output is not JSON'); }
    } finally { await rm(root, { recursive: true, force: true }); }
  } };
}
