import type { SourceSpan } from './source-span.js';

/** Exact, repository-scoped transport identity. An absent version is unknown, not a wildcard. */
export interface ObligationContract {
  readonly scope: string;
  readonly id: string;
  readonly kind: 'queue' | 'stored-data';
  readonly version?: string;
}
export interface ObligationDeclaration {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly role: 'guarantee' | 'requirement';
  /** Exact repository-relative file; existence does not prove implementation of the statement. */
  readonly endpoint: string;
  readonly contract: ObligationContract;
  readonly statement: string;
  readonly domain?: string;
  readonly stage?: string;
  readonly constraint?: {
    readonly metric: string;
    readonly operator: 'at-most' | 'at-least' | 'equal';
    readonly value: number;
    readonly unit?: string;
  };
  /** A documented consumer requirement, never evidence that the check runs. */
  readonly revalidation?: 'required' | 'not-required';
}
export interface ContractObligation {
  readonly method: 'explicit-markdown';
  readonly repositoryId: string;
  readonly declaration: ObligationDeclaration;
  readonly endpointSource: SourceSpan;
}

