# Coordinate cache operations

**Candidate after 0.10.0; not yet published.** This opt-in feature keeps cooperating
Weftlet builds and readers registered for their complete operation. It prepares
safe retention work; enabling it does not delete data or enforce a size target.

## Activate a dedicated cache root

First stop every process using that cache: CLI jobs, MCP servers, viewer requests,
older Weftlet versions and custom integrations. Upgrade those clients together.
Run activations one at a time; do not change root ownership during active work.
Then, using the candidate CLI:

```sh
npx weftlet cache coordination status --root /path/to/cache
npx weftlet cache coordination enable --root /path/to/cache --acknowledge-quiescence
```

`status` reads the owner, or returns `managedRoot: null`. `enable` requires an
existing directory and reports `changed`, `rootId` and `pruningEnabled: false`.
Repeated activation preserves the descriptor. It scans directory metadata, not
snapshot payloads, and refuses incomplete scans above 100,000 entries. Resolve
links/junctions and overlapping roots before activation; the command does not
reorganize your files. Never select a repository or filesystem root as a cache.

For default user storage, a single dedicated `~/.cache/context-graph` owner can
cover snapshot profiles and shared semantic artifacts. For separate roots,
activate each explicitly. Operations declare all required roots before starting.
A descriptor is local operational state: keep your project configuration unchanged.
It causes no new semantic extraction or snapshot profile. Unmarked caches continue
to work, including read-only installations without coordination metadata writes. Managed
readers need write access to coordination metadata even when graph payloads are
read-only; keep wholly read-only artifact deployments unmarked.

## Normal use and troubleshooting

Run hydration, queries, comparisons and transfers normally. Managed operations
create short-lived activity records under `.weftlet-coordination/participants`.
Independent readers/builders can run concurrently; exclusive maintenance waits for
them to finish. Waiting defaults to ten seconds. Aborting a running operation does
not release protection while its work is still active.

A blocked operation reports a coordination error. An interrupted process can leave
an activity marker or gate. An activity marker prevents exclusive maintenance;
a gate prevents new admission. Weftlet does not steal either based on age or PID.
Keep the record, stop all clients and use [explicit offline recovery](CACHE-RECOVERY.md)
to inspect supported interrupted state. Recovery is never automatic. Removing a marker while a client still uses files defeats the
protocol. Unsupported descriptors fail closed rather than silently running without
protection. This implementation requires a cooperative local filesystem; shared
network/distributed filesystems have not been qualified.

The local viewer protects each request, not the lifetime of an idle browser/server.
If evidence later becomes unavailable, a subsequent query reports the absence;
it does not substitute a newer graph. Portable exports protect their source and
managed output directory until publication/cleanup completes.

## Custom adapters and library consumers

Higher-level application methods cover their built-in cache roots. If your adapter
uses an additional managed directory, declare the entire set at the outer boundary:

```ts
import { withManagedCacheAccess, withSnapshotAccess } from '@weftlet/toolkit';

await withManagedCacheAccess([snapshotRoot, sharedArtifactRoot, adapterCacheRoot], async () => {
  await application.hydrator.hydrate({ ref: 'HEAD', headName: 'default' });
});

await withSnapshotAccess(snapshotRoot, async store => {
  await store.withFile(snapshotId, async filename => {
    if (!filename) throw new Error('Saved snapshot is absent');
    await consumeSnapshotFile(filename);
  });
});
```

The paths/functions in this example are supplied by your application. Raw managed
`FileSnapshotStore.file`, semantic artifact `file`, SCIP `index` and ontology
`compile` calls require an enclosing operation through their final file consumer.
Await all work inside it. Do not return a live stream or path for unprotected later
use. Nested calls cannot add another managed owner; declare it before entering.
The optional helper options accept `signal` and `timeoutMs` (1–300000 milliseconds)
for admission. Timeout is not a graph-build deadline.

An existing application using only unmarked storage needs no migration to continue
working. Older binaries and arbitrary filesystem readers do not obey this protocol;
activation alone cannot prove a mixed-version cache safe for collection.

## Current and previous generations

The candidate publishes the current snapshot ID and its immediate prior distinct
published ID together. Publishing the same ID again preserves both references and
the exact head bytes. Publishing a new ID rotates the old current to previous.
Snapshot files remain immutable. Legacy heads stay readable; their first distinct
advance starts tracking a predecessor, without guessing older history from dates.

Custom integrations can inspect both IDs within a protected operation:

```ts
await withSnapshotAccess(snapshotRoot, async store => {
  const head = await store.readHeadState('default');
  if (head?.previousSnapshotId) {
    const previous = await store.read(head.previousSnapshotId);
    // Use this historical evidence inside the callback.
  }
});
```

The predecessor is a previously published snapshot, not proof of current-diff or
business acceptance. Retention reviews protect it for active scopes; explicit
manual rollback declarations and pins can protect additional generations. Old
writers in unmarked caches can erase predecessor metadata. Upgrade all clients
and follow the managed-root activation procedure before relying on coordinated
retention. See [ADR 058](../ADR-058-atomic-head-generations.md).

## Retention is still separate

[Inventory](CACHE-INSPECTION.md) and [retention reviews](CACHE-RETENTION.md) remain
observations, including when scanning a parent containing multiple managed roots.
They are not collection locks or permission to delete. Current/previous
bookkeeping is implemented. The candidate adds separate [reviewed removal](CACHE-REMOVAL.md);
[explicit interrupted-operation recovery](CACHE-RECOVERY.md) is also available in this candidate. [Configurable history targets and indefinite retention](CACHE-HISTORY.md) now have an
explicit prepare/apply candidate. Recurring maintenance follows separately; necessary
graphs are never cut down to meet a history target.

For interrupted owners, see [explicit offline recovery](CACHE-RECOVERY.md). Stop all clients,
review the exact saved plan and preserve control records; PID/age alone never authorizes recovery.
