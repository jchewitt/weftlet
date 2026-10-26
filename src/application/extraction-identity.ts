import type { ContextGraphConfig } from '../configuration/config.js';
import { repositoryContractExtractorIdentity, scipSymbolExtractorIdentity } from '../extraction/static.js';
import { routingExtractorIdentity } from '../extraction/routing.js';

export const graphAssemblyVersion = 7;
export const graphAssemblyIdentity = `standalone-graph-v${graphAssemblyVersion}`;

/** Runtime expectations are separate from source/configuration identity and artifact reuse. */
export function requiredSnapshotExtractorVersions(config?: Pick<ContextGraphConfig, 'routingSources'>): Readonly<Record<string, string>> {
  return { assembly: graphAssemblyIdentity,
    [repositoryContractExtractorIdentity.id]: repositoryContractExtractorIdentity.version,
    [scipSymbolExtractorIdentity.id]: scipSymbolExtractorIdentity.version,
    ...(config?.routingSources?.length ? { [routingExtractorIdentity.id]: routingExtractorIdentity.version } : {}),
  };
}

export function incompatibleSnapshotExtractors(actual: Readonly<Record<string, string>> | undefined,
  expected: Readonly<Record<string, string>>): readonly string[] {
  return Object.keys(expected).filter((id) => actual?.[id] !== expected[id]).sort();
}
