import { posix } from 'node:path';
import type { CacheObject } from '../inspection/layout.js';
import type { ProfileDeclaration } from './policy.js';

const control = '.weftlet-coordination';
export const isCoordinationObject = (path: string) => path === control || path.startsWith(`${control}/`);
export const isTransientControl = (path: string) => path === `${control}/gate.lock` || path === `${control}/participants` || path.startsWith(`${control}/participants/`);
export function sumBytes(values: Iterable<number>) {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total) || total < 0) throw Error('Retention byte total is not safely representable');
  }
  return total;
}
/** Ownership declarations attribute bytes; they never make arbitrary files eligible for removal. */
export function repositoryAttribution(profiles: readonly ProfileDeclaration[]) {
  const declared = new Map(profiles.map(p => [p.path, p.repositoryId]));
  return (path: string) => {
    if (isCoordinationObject(path)) return undefined;
    let current = path;
    for (;;) {
      const repository = declared.get(current);
      if (repository !== undefined || current === '.') return repository;
      current = posix.dirname(current);
    }
  };
}
export function historyAccounting(objects: readonly CacheObject[], profiles: readonly ProfileDeclaration[], reservedControlBytes: number) {
  const repositoryFor = repositoryAttribution(profiles), repositoryBytes = new Map<string, number>();
  for (const profile of profiles) repositoryBytes.set(profile.repositoryId, 0);
  let unattributedBytes = 0;
  const measured = objects.filter(o => !isTransientControl(o.path));
  for (const entry of measured) {
    const repository = repositoryFor(entry.path);
    if (repository === undefined) unattributedBytes = sumBytes([unattributedBytes, entry.logicalBytes]);
    else repositoryBytes.set(repository, sumBytes([repositoryBytes.get(repository) ?? 0, entry.logicalBytes]));
  }
  const coordinationBytes = sumBytes([reservedControlBytes, ...measured.filter(o => isCoordinationObject(o.path)).map(o => o.logicalBytes)]);
  return { repositoryFor, repositoryBytes, unattributedBytes: sumBytes([unattributedBytes, reservedControlBytes]), coordinationBytes,
    observedBytes: sumBytes([reservedControlBytes, ...measured.map(o => o.logicalBytes)]) };
}
