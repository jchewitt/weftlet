import type { ContextPack, SnapshotManifest } from '@weftlet/core';

/** The saved identity/scope carried by exact graph queries; never resolve a new head. */
export function snapshotContext(manifest: SnapshotManifest): ContextPack['snapshot'] {
  return { snapshotId: manifest.snapshotId, commitSha: manifest.commitSha, contentDigest: manifest.contentDigest,
    configurationDigest: manifest.configurationDigest, scope: manifest.scope, baseSha: manifest.baseSha,
    overlayDigest: manifest.overlayDigest, overlayCapture: manifest.overlayCapture,
    extractorVersions: manifest.extractorVersions,
    ...(manifest.documentSelection ? { documentSelection: manifest.documentSelection } : {}) };
}
