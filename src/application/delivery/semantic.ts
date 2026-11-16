import type { SemanticArtifact } from '@weftlet/core';
import { reusableArtifact } from '../../extraction/semantic-cache.js';
import { semanticProviderIdentity, semanticArtifactOutputDigest } from '../../extraction/semantic-identity.js';
import { readJsonFile } from '../../storage/streaming-json.js';
import type { DeliveryContext } from './context.js';

export async function validateBundleArtifact(path: string, key: string, context?: DeliveryContext) {
  const artifact = await readJsonFile<SemanticArtifact>(path);
  if (!artifact || artifact.key !== key || !Array.isArray(artifact.facts) ||
      typeof artifact.rawModelOutput !== 'string' || typeof artifact.oml !== 'string' ||
      artifact.outputDigest !== semanticArtifactOutputDigest(artifact)) throw Error('Bundled semantic artifact is corrupt');
  if (context) {
    const source = artifact.source;
    if (!source || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(source.commitSha) ||
        typeof source.path !== 'string' || !source.path || source.path.startsWith('/') ||
        /[\\\x00]/.test(source.path) || source.path.split('/').some(p => !p || p === '.' || p === '..') ||
        source.path.includes(':')) throw Error('Invalid semantic source identity');
    const sources = await context.repository.semanticSources({ commitSha: source.commitSha }, [source.path]);
    const exact = sources.find(candidate => candidate.path === source.path);
    if (!exact || !reusableArtifact(artifact, key, exact, context.config.semantic,
      semanticProviderIdentity(context.config.semantic))) throw Error('Semantic artifact does not match committed source and the configured extraction contract');
  }
  return artifact;
}
