import type { ContextGraphConfig } from '../configuration/config.js';
import { StructuredCliSemanticExtractor } from './structured-semantic.js';
import { runOpenCodeStructuredRequest, type OpenCodeRuntime } from './opencode-request.js';

export class OpenCodeCliSemanticExtractor extends StructuredCliSemanticExtractor {
  constructor(config: ContextGraphConfig['semantic'], runtime: OpenCodeRuntime = {}) {
    super(config, (schema, prompt, options) => runOpenCodeStructuredRequest(config, schema, prompt, 2 * 1024 * 1024, options, runtime));
  }
}
