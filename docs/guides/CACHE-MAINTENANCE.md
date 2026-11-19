# Run recurring history maintenance

**Candidate after 0.10.0; not yet published.** Once you have reviewed a
[history policy](CACHE-HISTORY.md), `cache retention maintain` can apply it to
eligible snapshot history on each invocation. Run it manually, from a trusted CI
job with a persistent cache, or through your operating system's task scheduler.
Weftlet installs no scheduler and does not start cleanup during installation,
hydration or queries.

## Review once, run the policy repeatedly

First [activate coordination](CACHE-COORDINATION.md) and declare the profiles,
active scopes and historical pins. Configure a history target or indefinite
retention. The policy must live outside the cache.

```sh
npx --no-install weftlet cache retention prepare --root /path/to/cache --policy /path/to/retention.json --json > reviewed-plan.json
```

Review the complete report, including `canApply`, protected data, selected history,
unknown profiles, target overages, pin expiries and the meaning of the policy for
future generations. Record its exact `rootId` and `policyDigest`. Then run:

```sh
npx --no-install weftlet cache retention maintain --root /path/to/cache --policy /path/to/retention.json --expect-root REVIEWED_ROOT_ID --expect-policy REVIEWED_POLICY_DIGEST --json
```

Replace the two placeholders with those reviewed values. Keep them fixed in the
scheduled command. Do not calculate a new digest automatically immediately before
cleanup: the explicit digest is what detects an unreviewed policy change.

This command authorizes **permanent deletion according to the reviewed policy**,
including future eligible snapshots. It does not reuse the old plan's file list.
Each run takes exclusive maintenance access, inventories current files, resolves
current references, selects eligible history and uses the same durable removal
engine as reviewed `apply`. Root and policy identity are checked before journal
creation; policy and file identity are checked again before each unlink.

`apply --plan ... --expect-plan ...` remains available when you want to review
one exact batch. `maintain` deliberately has no `--plan` argument. Its root/policy
identifiers guard the chosen cache and policy; they are not credentials or a
replacement for filesystem access controls.

## Adopt an already oversized cache

The target applies to existing history too. Follow the [migration steps](CACHE-HISTORY.md#upgrade-a-cache-that-is-already-over-target)
to identify old profiles and pointers. Retire obsolete heads through one-time
reviewed `prepare/apply`, inspect the result, and remove only confirmed completed
retirement declarations. **`releasedHeads` must be empty before recurring
maintenance can run**, including in indefinite mode. Missing or advanced head
retirements are never guessed away.

Prepare the final policy again and review its root/policy IDs. After this initial
migration, ordinary repeated maintenance needs no policy edit for each new
snapshot. Active heads resolve their current and tracked previous generation on
every run. Newly encountered heads remain protected even if not declared active.
Use explicit pins for extra history; an explicitly configured pin expiry can make
that history eligible on a later run without changing the policy digest.

A later target, repository, scope or pin change requires a fresh policy review and
updated `--expect-policy`. A replaced or reactivated cache with a different root
identity also needs review. Retention settings remain outside extraction identity
and never require a model call.

To include a verified SCIP index with a selected superseded snapshot, set the top-level retention policy property `"retireCompanionIndexes": true`, prepare again, review the paired paths and use the new policy digest. Existing scheduled policies keep their index files. [Companion retirement details](CACHE-REMOVAL.md#reclaim-companion-scip-indexes).

## Scheduling and stopping

Use the same fixed command from a trusted job on the machine that owns the cache.
For example, a persistent self-hosted CI runner can run it as a separate maintenance
step after graph work finishes. An ephemeral hosted runner only cleans its own
local cache; it cannot clean another machine's history. Keep untrusted pull-request
jobs away from the writable persistent cache. No workflow is installed or edited
by this command.

Use absolute policy/cache paths and the installed CLI from the intended package
version in a scheduled job. `--wait-ms` bounds waiting for active cache users;
`--max-entries` and `--max-bytes` bound inventory work as in `prepare`. Incomplete
inventory blocks removal. These are inspection limits, not graph-size quotas.
Readers and publishers drain before maintenance starts; concurrent maintenance
runs serialize, and the later run recomputes its selection.

To stop future maintenance, remove/disable the scheduled command. To retain all
history, change `history` to `{"mode":"indefinite"}`, prepare/review the new policy,
and update the scheduled digest if you want continued usage reporting. An old
command will refuse that changed policy. Cancellation stops at the next checked
boundary; already completed deletions are not rolled back.

## Results and recovery

JSON includes the bound root/policy IDs, the selection's `history` report, and the
`removal` result with exact deleted paths and logical bytes. Protected overage is a
valid result. A necessary graph remains usable even when protected evidence alone
exceeds the target. Selected/projected totals describe the inventory before new
journal overhead; use `cache usage` for a fresh post-operation observation.

Indefinite and under-target no-ops create no removal journal. Nonempty runs retain
durable removal records. A completed ordinary partial failure returns exit code 1;
a later invocation freshly selects the remaining eligible history, preserving
current references and pins. It never replays an old deletion list blindly.

An interrupted pending journal or abandoned participant blocks maintenance until
[explicit recovery](CACHE-RECOVERY.md). No lock is stolen and no recovery is
performed automatically. Changed policy/root identity and incomplete inventory
also fail clearly. Snapshot bytes, citations, authority and semantic artifacts
that remain retained are unchanged; maintenance does not validate a current diff
or substitute a different snapshot when an old ID has been removed.
