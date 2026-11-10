import type { ExtractionContext, SemanticSource } from '@weftlet/core';
import type { ContextGraphConfig } from '../configuration/config.js';
import { assertSemanticOutput, semanticOutputSchema, type SemanticExtractor } from './semantic.js';
import { semanticProviderIdentity } from './semantic-identity.js';
import { semanticPrompt } from './semantic-prompt.js';
import { SemanticProviderError, type SemanticRunOptions } from './semantic-process.js';

type Request = (schema: unknown, prompt: string, options: SemanticRunOptions) => Promise<unknown>;
/** Shared validation/retry policy for structured CLI adapters; Codex retains its existing raw-artifact contract. */
export class StructuredCliSemanticExtractor implements SemanticExtractor {
  readonly identity: string;
  constructor(private readonly config: ContextGraphConfig['semantic'], private readonly request: Request) {
    this.identity = semanticProviderIdentity(config);
  }
  async extract(source: SemanticSource, context: ExtractionContext, options: SemanticRunOptions = {}) {
    if (options.signal?.aborted) throw new SemanticProviderError('cancelled', 'Semantic extraction cancelled');
    if (Buffer.byteLength(source.content) > (this.config.maxSourceBytes ?? 65_536)) {
      throw new SemanticProviderError('invalid-output', 'Semantic source exceeds configured byte budget');
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const parsed = await this.request(semanticOutputSchema(source.content.split('\n').length), semanticPrompt(source, context, false), options);
        assertSemanticOutput(parsed, source);
        return { parsed, rawModelOutput: JSON.stringify(parsed) };
      } catch (error) {
        if (!(error instanceof SemanticProviderError) || !error.retryable || attempt >= (this.config.retries ?? 0) || options.signal?.aborted) throw error;
      }
    }
  }
}
