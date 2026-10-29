// Modified for standalone extraction; see docs/extraction-manifest.json.
import { readFile } from 'node:fs/promises';
import { repositoryFileNode, type ExtractionContext, type FactExtractor, type GraphFact, type GraphNode } from '@weftlet/core';
import type { GitRepository } from '../repository/git.js';
import type { ScipIndexResult } from './scip-runtime.js';
import { loadScipRuntime } from './scip-runtime.js';
import { extractCodeOccurrences } from './scip-occurrences.js';
import { sha256, stableJson } from '../infrastructure/util.js';

interface ScipSite {
  readonly path: string;
  readonly line: number;
  readonly digest: string;
  readonly component: GraphNode;
}

interface ScipSymbolSites {
  readonly definitions: Map<string, ScipSite>;
  readonly references: Map<string, ScipSite>;
}

export const scipSymbolExtractorIdentity = { id: 'scip-symbol-extractor', version: '2.0.0' } as const;

export class ScipSymbolExtractor implements FactExtractor {
  readonly identity = scipSymbolExtractorIdentity;

  constructor(
    private readonly repository: GitRepository,
    private readonly index: ScipIndexResult,
  ) {}

  async extract(context: ExtractionContext): Promise<readonly GraphFact[]> {
    const parsed = loadScipRuntime().scip.Index.deserializeBinary(await readFile(this.index.path));
    const symbols = new Map<string, ScipSymbolSites>();
    const sources = new Map<string, string>();
    for (const document of parsed.documents) {
      const path = document.relative_path.replace(/\\/g, '/');
      const content = await this.repository.readFileAt(context.commitSha, path);
      sources.set(path, content);
      const digest = sha256(content);
      const component = repositoryFileNode(path);
      for (const occurrence of document.occurrences) {
        if (!occurrence.symbol || occurrence.symbol.startsWith('local ')) continue;
        const definition = (occurrence.symbol_roles & 1) === 1;
        const sites = symbols.get(occurrence.symbol) ?? {
          definitions: new Map<string, ScipSite>(),
          references: new Map<string, ScipSite>(),
        };
        symbols.set(occurrence.symbol, sites);
        const target = definition ? sites.definitions : sites.references;
        if (target.has(path)) continue;
        target.set(path, {
          path,
          line: (occurrence.range[0] ?? 0) + 1,
          digest,
          component,
        });
      }
    }
    const facts: GraphFact[] = [];
    for (const [symbolText, sites] of [...symbols.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const definitionPaths = new Set(sites.definitions.keys());
      const downstream = [...sites.references.values()].filter(
        (site) => !definitionPaths.has(site.path),
      );
      if (sites.definitions.size === 0 || downstream.length === 0) continue;
      const symbol = {
        id: `symbol:scip:${sha256(symbolText)}`,
        kind: 'Contract' as const,
        label: symbolText,
        attributes: { scipIndexDigest: this.index.digest },
      };
      const relationships = [
        ...[...sites.definitions.values()].map((site) => ({ site, definition: true })),
        ...downstream.map((site) => ({ site, definition: false })),
      ];
      for (const { site, definition } of relationships) {
        const relation = definition ? 'definition' : 'reference';
        const provenance = {
          path: site.path,
          startLine: site.line,
          endLine: site.line,
          digest: site.digest,
          commitSha: context.commitSha,
        };
        facts.push({
          id: sha256(stableJson({ relation, path: site.path, symbol: symbolText, provenance })),
          subject: site.component,
          predicate: definition ? 'contains' : 'consumes',
          object: symbol,
          provenance,
          extractor: this.identity,
          confidence: 1,
          snapshotId: context.snapshotId,
        });
      }
    }
    return [...facts, ...extractCodeOccurrences(parsed, sources, context, this.index.digest, this.identity)];
  }
}

