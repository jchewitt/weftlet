import type { ExtractionContext, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { assertSemanticOutput, semanticOutputSchema, type SemanticExtractor } from './semantic.js';
import { semanticProviderIdentity } from './semantic-identity.js';
import { semanticPrompt } from './semantic-prompt.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';
import { runClaudeStructuredRequest, type ClaudeRuntime } from './claude-request.js';

export class ClaudeCliSemanticExtractor implements SemanticExtractor {
  readonly identity: string;
  constructor(private readonly config: ContextGraphConfig['semantic'], private readonly runtime: ClaudeRuntime = {}) {
    this.identity = semanticProviderIdentity(config);
  }

  async extract(source: SemanticSource, context: ExtractionContext, options: SemanticRunOptions = {}) {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Semantic extraction cancelled');
    if (Buffer.byteLength(source.content) > (this.config.maxSourceBytes ?? 65_536)) {
      throw new SemanticProviderError('invalid-output', 'Semantic source exceeds configured byte budget');
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const parsed = await runClaudeStructuredRequest(this.config, semanticOutputSchema(source.content.split('\n').length),
          semanticPrompt(source, context, false), 2 * 1024 * 1024, options, this.runtime);
        assertSemanticOutput(parsed, source);
        // Retain only the structured model output, not CLI session/account/usage metadata.
        return { parsed, rawModelOutput: JSON.stringify(parsed) };
      } catch (error) {
        if (!(error instanceof SemanticProviderError) || !error.retryable || attempt >= (this.config.retries ?? 0) || options.signal?.aborted) throw error;
      }
    }
  }
}
