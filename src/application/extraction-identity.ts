import { documentCodeBindingIdentity } from '../extraction/document-code-bindings.js';
import { staticCallIdentity } from '../extraction/static-calls.js';
import { documentObligationIdentity } from '../extraction/document-obligations.js';
import type { ContextGraphConfig } from '../configuration/config.js';
import { repositoryContractExtractorIdentity, scipSymbolExtractorIdentity } from '../extraction/static.js';
import { routingExtractorIdentity } from '../extraction/routing.js';
import { documentEvidenceExtractorIdentity } from '../extraction/document-evidence.js';
import { documentSelectionIdentity } from './hydration-inputs.js';

export const graphAssemblyVersion = 11;
export const graphAssemblyIdentity = `standalone-graph-v${graphAssemblyVersion}`;

export function documentExtractionVersions(config?: Pick<ContextGraphConfig, 'documentTraversal'>): Readonly<Record<string, string>> {
  return config?.documentTraversal ? { 'document-selection': documentSelectionIdentity,
    [documentEvidenceExtractorIdentity.id]: documentEvidenceExtractorIdentity.version } : {};
}

/** Runtime expectations are separate from source/configuration identity and artifact reuse. */
export function requiredSnapshotExtractorVersions(config?: Pick<ContextGraphConfig, 'routingSources' | 'documentTraversal'>): Readonly<Record<string, string>> {
  return { assembly: graphAssemblyIdentity,
    [documentCodeBindingIdentity.id]: documentCodeBindingIdentity.version,
    [staticCallIdentity.id]: staticCallIdentity.version,
    [documentObligationIdentity.id]: documentObligationIdentity.version,
    ...documentExtractionVersions(config),
    [repositoryContractExtractorIdentity.id]: repositoryContractExtractorIdentity.version,
    [scipSymbolExtractorIdentity.id]: scipSymbolExtractorIdentity.version,
    ...(config?.routingSources?.length ? { [routingExtractorIdentity.id]: routingExtractorIdentity.version } : {}),
  };
}

export function incompatibleSnapshotExtractors(actual: Readonly<Record<string, string>> | undefined,
  expected: Readonly<Record<string, string>>): readonly string[] {
  return Object.keys(expected).filter((id) => actual?.[id] !== expected[id]).sort();
}
