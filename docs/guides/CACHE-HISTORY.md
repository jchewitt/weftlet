# Configure retained history

**Requires Weftlet 0.11.0 or later.** Configure local history in a separate
retention policy JSON file, then use coordinated `prepare/apply` to reconcile existing
history. This first R4 slice selects history by policy; it does not install a background
collector or run deletion during package installation, hydration or ordinary queries.
Opt-in [recurring maintenance](CACHE-MAINTENANCE.md) uses explicit root/policy review and external scheduling.

## Choose a target or indefinite retention

Start a policy outside the cache:

```sh
npx weftlet cache retention init --file ./retention.json --target-bytes 10737418240
```

That is a **10 GiB retention target**, not a maximum graph size or build quota. Choose
another nonnegative integer byte value as needed. Zero selects all eligible history,
while preserving required evidence. To keep history indefinitely instead:

```sh
npx weftlet cache retention init --file ./retention.json --keep-indefinitely
```

`init` refuses overwrites. These options are mutually exclusive. Without either option,
it retains the existing manual-review policy format: all otherwise eligible history is
proposed for explicit review, with no size target. Existing policies without `history`
keep that manual behavior; an update does not silently turn on collection.

Fill in the profiles, active scopes and pins as described in the
[retention declaration guide](CACHE-RETENTION.md). The optional `history` field looks like:

```json
{
  "mode": "target",
  "maxBytes": 10737418240,
  "repositories": [
    { "repositoryId": "example/mobile", "mode": "target", "maxBytes": 3221225472 },
    { "repositoryId": "example/audit", "mode": "indefinite" }
  ]
}
```

This is the value of `history`, not a complete policy. Each override must name an exact
repository ID already declared by a profile, once. A repository target applies across
all of its declared profiles; it is not a separate allowance for every config hash.
The root target also applies across all repositories in the selected root. Repository
targets are additional targets, not reserved shares of the root total. A repository
marked indefinite is protected from root-target eviction too.

For global indefinite retention, use `"history": { "mode": "indefinite" }` and omit
`maxBytes` and repository overrides. This retains all history under this policy,
including otherwise releasable heads. It does not disable operation-owned temporary
cleanup, create a backup or promise the disk cannot fill. Explicitly changing the
policy and reviewing a new plan remains possible.

## Upgrade a cache that is already over target

1. Inspect existing bytes with `cache usage --root /path/to/cache --json` and follow
   [managed-root activation](CACHE-COORDINATION.md). Stop older clients before adoption.
2. Declare the exact profiles, active scopes and extra historical pins. Old/undeclared
   head pointers still protect their current and previous targets. Explicitly retire
   only scopes you no longer need, at their exact saved head IDs. Unknown data remains.
3. Configure `history`, then prepare and review the selected history:

   ```sh
   npx weftlet cache retention prepare --root /path/to/cache --policy ./retention.json --json > prepared.json
   npx weftlet cache retention apply --root /path/to/cache --policy ./retention.json --plan ./prepared.json --expect-plan PLAN_ID --json
   ```

The policy applies to old files already on disk, not just new generations. Selection
removes the oldest eligible snapshot history until the targets can be met or eligible
history is exhausted. Modification time is an operational ordering signal, **not**
evidence age, last access or authority. Equal times use a deterministic path tie-break.
Released heads accompany a selected snapshot only when required to remove its reference;
shared prerequisites are counted once. Newer eligible history is retained when possible.

Choose **one exact managed root spanning the user cache** for a user-wide target across
repositories/configurations/checkouts. Separate roots do not automatically share a global
allowance. Nested managed owners are rejected; migrating separately activated roots needs
quiescence and explicit ownership planning, not automatic relabeling or deletion.

After an operation retires a head, remove only that confirmed retirement declaration
before preparing again. The old declaration deliberately blocks when its exact head is
missing. Recurring maintenance requires completed one-time migration and an empty `releasedHeads` array; it never silently acknowledges a missing head. If nothing is selected, apply returns a complete no-op with
`journalPath: null`, `operationId: null` and no new removal journal. Repeated no-op runs
therefore do not accumulate journals.

## Read the byte report

Both observational `plan` and coordinated `prepare` include a `history` report:

| Field | Meaning |
| --- | --- |
| `mode`, `accountingScope` | Manual, target or indefinite policy; exact byte basis used. |
| `root.observedBytes` | Observed logical bytes under the selected root, including undeclared/unattributed data and persistent control records for configured modes. |
| `root.selectedBytes`, `projectedBytes` | Selected removal bytes and retained bytes after that selection, before new journal overhead. |
| `root.retainedMinimumBytes` | Bytes left even if every eligible snapshot group were removed under the policy. |
| `projectedOverageBytes`, `protectedOverageBytes` | Remaining excess and the portion that cannot be reclaimed under current protections. |
| `repositories` | Corresponding totals/targets for each declared repository; nested declarations attribute their own files. An absent repository target inherits only the root selection. |
| `unattributedBytes`, `coordinationBytes` | Visible bytes outside declared repository attribution, and persistent control overhead (a subset of unattributed bytes). |
| `selectedSnapshotFiles`, `retainedEligibleFiles` | Selected snapshots and eligible files retained within the targets. |

Per-object reasons explain current/previous/head/pin protection, indefinite retention,
unsupported/unknown/shared data and history selected or retained within the target.
Attribution of an unknown file to a declared profile does **not** authorize its removal.
Semantic artifacts, unknown files and scratch data remain protected and count toward observed use. SCIP indexes remain protected by default. With [companion retirement](CACHE-REMOVAL.md#reclaim-companion-scip-indexes) enabled, a verified index contributes its bytes to the same selection group as its superseded snapshot. Root-wide persistent audit/control bytes count too.
Transient admission and participant markers are excluded to keep coordinated decisions
stable while the operation holds its own gate.

Targets use **logical bytes by path**, not allocated physical bytes. Hard links remain
protected; reflinks, compression and shared extents are not inferred. New removal journals
can increase actual post-operation use beyond the projection. Use `cache usage` afterward
for a fresh observation. A `complete` operation means its reviewed actions completed; it
is not a claim that the disk footprint is now below the target.

If current/previous/pinned/indefinite or other protected data alone exceeds a target,
Weftlet retains it and reports the overage. It does not reduce scope, truncate facts,
reject a necessary graph or invoke a model to save disk space. Actual disk exhaustion
remains a separate operational limit. Raise the target, deliberately revise protections
or use a verified private archive when appropriate.

## Compatibility and failures

Retention policy is operational. Changing it does not change project extraction config,
semantic cache identity or immutable snapshot bytes. Saved prepared plans from the prior
planner version must be regenerated. Target, pin, head, file-byte or modification-time
changes invalidate the reviewed plan before removal. In configured modes, persistent
control-byte changes also require fresh preparation; after a failed attempt creates an
audit journal, reprepare even when it removed no evidence. Legacy manual mode omits
control bytes from its new summary to preserve the existing zero-deletion retry contract;
`cache usage` still reports the full footprint.

Indefinite/under-target no-ops do not add journals. A blocked/incomplete inventory is not
permission to collect; protected overage alone is not a validation failure. Cancellation,
readers/writers, partial I/O failure and interrupted journals use the existing
[removal](CACHE-REMOVAL.md) and [recovery](CACHE-RECOVERY.md) boundaries.

For durable history, use an explicitly selected private destination, retain exact evidence
and required artifacts/checksums, and verify restoration before separately approved local
eviction. [Snapshot delivery](SNAPSHOT-DELIVERY.md) is available; managed archives/remote
storage remain [R6/2.0 work](../CACHE-RETENTION-PLAN.md#long-term-history-and-backup-guidance).
