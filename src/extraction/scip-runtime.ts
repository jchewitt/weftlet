// Modified for standalone extraction; see docs/extraction-manifest.json.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export interface ScipOccurrence {
  readonly range: readonly number[];
  readonly symbol: string;
  readonly symbol_roles: number;
  readonly enclosing_range?: readonly number[];
}

export interface ScipDocument {
  readonly relative_path: string;
  readonly occurrences: readonly ScipOccurrence[];
  readonly symbols: readonly ScipSymbolInformation[];
}

interface ScipSymbolInformation {
  documentation: string[];
}

export interface ScipIndex {
  readonly documents: readonly ScipDocument[];
  readonly external_symbols: readonly ScipSymbolInformation[];
  readonly metadata?: { project_root: string };
  serializeBinary(): Uint8Array;
}

interface ScipRuntime {
  readonly scip: {
    readonly Index: {
      deserializeBinary(bytes: Uint8Array): ScipIndex;
    };
  };
}

export function loadScipRuntime(): ScipRuntime {
  const require = createRequire(import.meta.url);
  const main = require.resolve('@sourcegraph/scip-typescript');
  return require(join(dirname(main), 'scip.js')) as ScipRuntime;
}

export interface ScipIndexResult {
  readonly path: string;
  readonly digest: string;
  readonly mode: 'full' | 'package';
  readonly version: string;
  /** Exact document paths observed in the normalized index, including zero-occurrence documents. */
  readonly indexedPaths?: readonly string[];
}

