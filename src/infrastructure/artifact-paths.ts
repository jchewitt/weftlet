import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

/** Physical names only. Logical identities and evidence must retain the original value. */
export function physicalArtifactKey(identity: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(identity) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(identity)) return identity;
  // '~' is excluded from literal logical storage keys, so a digest cannot alias one.
  return `~${createHash('sha256').update(identity).digest('hex')}`;
}

/** Same-directory staging preserves atomic rename/link without repeating a long basename. */
export function temporaryArtifactPath(destination: string): string {
  return join(dirname(destination), `.${randomUUID()}.tmp`);
}
