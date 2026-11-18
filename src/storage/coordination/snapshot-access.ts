import { withManagedCacheAccess } from './managed-access.js';
import { managedRootForPath } from './managed-root.js';
import { FileSnapshotStore } from '../storage.js';
import { withCacheAccess, type CacheAccessOptions } from './access.js';

/** One lease spans head lookup, reads, publication and any file-copy callback. */
export async function withSnapshotAccess<T>(root: string, run: (store: SnapshotAccess) => Promise<T>, options: CacheAccessOptions = {}): Promise<T> {
  const access = async <R>(run: () => Promise<R>) => await managedRootForPath(root)
    ? withManagedCacheAccess([root], run, options) : withCacheAccess(root, run, options);
  return access(async () => {
    const raw = new FileSnapshotStore(root), pending = new Set<Promise<unknown>>();
    let active = true;
    function track<R>(operation: () => Promise<R>): Promise<R> {
      if (!active) return Promise.reject(Error('Snapshot access scope has ended'));
      const result = Promise.resolve().then(operation);
      pending.add(result);
      // Register both handlers without creating an unhandled rejected cleanup promise.
      void result.then(() => pending.delete(result), () => pending.delete(result));
      return result;
    }
    const store: SnapshotAccess = {
      read: id => track(() => raw.read(id)),
      readHead: name => track(() => raw.readHead(name)),
      readHeadManifest: name => track(() => raw.readHeadManifest(name)),
      headId: name => track(() => raw.headId(name)),
      readRevision: id => track(() => raw.readRevision(id)),
      write: snapshot => track(() => raw.write(snapshot)),
      updateHead: (name, id, condition) => track(() => raw.updateHead(name, id, condition)),
      withFile: (id, copy) => track(async () => copy(await raw.file(id))),
    };
    try { return await run(store); }
    finally {
      active = false;
      // Even mistakenly unawaited calls must settle before maintenance can enter.
      await Promise.allSettled([...pending]);
    }
  });
}
export type SnapshotAccess = Pick<FileSnapshotStore, 'read' | 'readHead' | 'readHeadManifest' | 'headId' | 'readRevision' | 'write' | 'updateHead'> & {
  /** Consume the path within the callback; an escaped path is not protected after it settles. */
  withFile<T>(id: string, consume: (path: string | undefined) => Promise<T>): Promise<T>;
};
