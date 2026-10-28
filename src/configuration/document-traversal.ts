import { validateDocumentTraversalOptions, type DocumentTraversalOptions } from '../extraction/document-traversal.js';
import { parseDocumentClassificationPolicy, type DocumentClassificationPolicy } from '../extraction/document-classification.js';

/** Explicit execution mode; the direct semanticSources list is not added to its closure. */
export interface DocumentTraversalConfig extends Omit<DocumentTraversalOptions, 'maxDocuments' | 'maxSourceBytes'> {
  readonly policy?: DocumentClassificationPolicy;
}

export function assertDocumentTraversalConfig(value: unknown): asserts value is DocumentTraversalConfig {
  const fields = ['entryPoints', 'roots', 'maxReadDocuments', 'maxReadBytes', 'maxDocumentBytes', 'policy'];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error('documentTraversal must contain only supported traversal options and policy');
  }
  const options = value as DocumentTraversalConfig;
  validateDocumentTraversalOptions(options);
  if (options.policy !== undefined) parseDocumentClassificationPolicy(options.policy);
}
