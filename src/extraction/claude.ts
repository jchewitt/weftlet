import type { ContextGraphConfig } from '../configuration/config.js';
import { StructuredCliSemanticExtractor } from './structured-semantic.js';
import { runClaudeStructuredRequest, type ClaudeRuntime } from './claude-request.js';

export class ClaudeCliSemanticExtractor extends StructuredCliSemanticExtractor {
  constructor(config: ContextGraphConfig['semantic'], runtime: ClaudeRuntime = {}) {
    super(config, (schema, prompt, options) => runClaudeStructuredRequest(config, schema, prompt, 2 * 1024 * 1024, options, runtime));
  }
}
