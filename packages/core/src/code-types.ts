export interface CodeRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly columnEncoding: 'utf-16';
}

export type CodeResolution = 'indexed-definition' | 'declaration-only' | 'no-indexed-definition';

export interface CodeSymbolDescriptor {
  readonly schemaVersion: 1;
  readonly provider: string;
  readonly repositoryId: string;
  readonly nativeSymbol: string;
  readonly identityScope: 'repository' | 'index-document';
  /** Required for local identities. Native local ordinals have no cross-index stability promise. */
  readonly documentPath?: string;
  readonly indexDigest?: string;
  readonly resolution: CodeResolution;
}

export interface CodeOccurrence {
  readonly schemaVersion: 1;
  readonly role: 'definition' | 'reference';
  /** Native module anchors can be zero-width and precede the declared extent. */
  readonly locationKind: 'name' | 'zero-width-anchor';
  readonly nativeRoles: number;
  /** Narrowest unambiguous native declaration range, not an inferred caller. */
  readonly enclosure: 'native-range' | 'file' | 'ambiguous';
  readonly enclosingSymbolId?: string;
  /** Native declaration/body extent; arrow initializer ranges may exclude the variable name. */
  readonly declarationRange?: CodeRange;
}

