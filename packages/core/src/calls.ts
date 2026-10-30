import type { BindingEvidence } from './bindings.js';

/** Syntactic invocation linked to SCIP declarations, never proof of runtime execution. */
export interface CodeCall {
  readonly schemaVersion: 1;
  readonly method: 'typescript-ast+scip';
  readonly syntax: 'call' | 'construct';
  readonly dispatch: 'lexical' | 'member' | 'construct';
  readonly optional: boolean;
  readonly caller: 'indexed-callable' | 'file-scope';
  readonly target: 'indexed-body' | 'indexed-class' | 'declaration-only' | 'external';
  readonly runtime: 'not-observed';
  readonly callerDefinitions: readonly BindingEvidence[];
  readonly targetOccurrences: readonly BindingEvidence[];
  readonly targetDefinitions: readonly BindingEvidence[];
}
