import { AsyncLocalStorage } from 'node:async_hooks';
import { CacheCoordinationBlocked, withCacheAccess, type CacheAccessOptions } from './access.js';
import { managedRootsForPaths } from './managed-root.js';

interface Scope { roots: ReadonlySet<string>; active: boolean; pending: Set<Promise<unknown>> }
const scopes = new AsyncLocalStorage<Scope>();
async function inScope<T>(roots: ReadonlySet<string>, run: () => Promise<T>) {
  const scope: Scope = { roots, active: true, pending: new Set() };
  return scopes.run(scope, async () => {
    try { return await run(); }
    finally { scope.active = false; await Promise.allSettled([...scope.pending]); }
  });
}
function track<T>(scope: Scope | undefined, operation: Promise<T>) {
  if (scope) {
    scope.pending.add(operation);
    void operation.then(() => scope.pending.delete(operation), () => scope.pending.delete(operation));
  }
  return operation;
}
/** Declare every path up front. Nested operations reuse protection and cannot expand the root set. */
export function withManagedCacheAccess<T>(paths: readonly string[], run: () => Promise<T>, options: CacheAccessOptions = {}): Promise<T> {
  const parent = scopes.getStore();
  if (parent && !parent.active) return Promise.reject(Error('Managed cache operation scope has ended'));
  return track(parent, (async () => {
    const timeout = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw Error('Cache coordination timeout must be 1–300000 milliseconds');
    options.signal?.throwIfAborted();
    const roots = await managedRootsForPaths(paths);
    if (parent) {
      if (roots.some(root => !parent.roots.has(root))) throw Error('Nested cache operation needs an undeclared managed root; declare all roots at entry');
      return inScope(parent.roots, run);
    }
    const started = performance.now();
    async function acquire(index: number): Promise<T> {
      if (index === roots.length) return inScope(new Set(roots), run);
      const remaining = Math.ceil(timeout - (performance.now() - started));
      if (remaining <= 0) throw new CacheCoordinationBlocked('admission');
      return withCacheAccess(roots[index]!, () => acquire(index + 1), { ...options, timeoutMs: remaining });
    }
    return acquire(0);
  })());
}
/** Filename-producing APIs require a caller-owned scope through their final consumer. */
export async function requireManagedCacheScope(paths: readonly string[]) {
  const roots = await managedRootsForPaths(paths), scope = scopes.getStore();
  if (roots.length && (!scope?.active || roots.some(root => !scope.roots.has(root)))) {
    throw Error('Managed cache paths require an enclosing withManagedCacheAccess operation through file consumption');
  }
}
/** Preserve class/private-field receivers; wrap only the explicitly declared async API. */
export function coordinateMethods<T extends object>(target: T, paths: readonly string[], methods: readonly (keyof T)[], scopedPaths: readonly (keyof T)[] = [], optionsFor?: (method: keyof T, args: readonly unknown[]) => CacheAccessOptions): T {
  const selected = new Set(methods), requiresScope = new Set(scopedPaths);
  return new Proxy(target, { get(object, name, receiver) {
    const value = Reflect.get(object, name, receiver);
    if (!selected.has(name as keyof T) || typeof value !== 'function') return value;
    return (...args: unknown[]) => requiresScope.has(name as keyof T)
      ? track(scopes.getStore(), requireManagedCacheScope(paths).then(() => withManagedCacheAccess(paths, () => Reflect.apply(value, object, args), optionsFor?.(name as keyof T, args))))
      : withManagedCacheAccess(paths, () => Reflect.apply(value, object, args), optionsFor?.(name as keyof T, args));
  } });
}
