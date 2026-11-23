# Review cache retention

Included in the **0.10.0 release scope**; see [release status](../RELEASES.md).
These review commands turn the
[cache inventory](CACHE-INSPECTION.md) into an explicit retention review. It names
managed profiles, active heads, previous generations and exceptional historical
pins. Planning and checking read saved data without Git, providers or hydration.
Every observational R3a report has `canApply: false`. The post-0.10.0 candidate
adds separate [coordinated preparation/removal](CACHE-REMOVAL.md); old reports
remain ineligible for apply.

## Create a policy

Keep the policy and saved reports **outside the inspected cache root**. Creating
or updating a report inside that root changes its inventory and makes the next
check stale. The root is selected explicitly for each command.

```sh
npx weftlet cache retention init --file ./retention.json --json
npx weftlet cache usage --root /path/to/cache --json
```

`init` creates an empty policy and refuses to overwrite an existing file. Empty
policy means every profile remains unmanaged and retained. Use the inventory's
exact profile paths and manifest repository IDs to fill in declarations:

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "path": ".",
      "repositoryId": "public/demo",
      "owner": "maintainers",
      "reason": "Local development evidence"
    }
  ],
  "activeScopes": [
    {
      "profile": ".",
      "head": "default",
      "previousSnapshotId": "previous-known-good-id",
      "owner": "maintainers",
      "reason": "Current development and one rollback generation"
    }
  ],
  "releasedHeads": [
    {
      "profile": ".",
      "head": "closed-investigation",
      "snapshotId": "exact-old-target-id",
      "owner": "maintainers",
      "reason": "Investigation complete; this scope is no longer active"
    }
  ],
  "pins": [
    {
      "profile": ".",
      "snapshotId": "reproduction-id",
      "owner": "issue-reviewer",
      "reason": "Keep the original evidence for an open investigation",
      "expiresAt": "2027-01-15T00:00:00.000Z"
    }
  ]
}
```

Replace example IDs with real saved IDs. Omit `previousSnapshotId` when there is
no declared rollback generation; it must differ from the current head. Pins without
`expiresAt` remain protected until explicitly removed from the policy. Expiry is
an exact UTC ISO timestamp, not a file-age heuristic. An expired pin stops adding
protection, but other current/head/pin relationships still apply. Checking across
an expiry transition produces a different plan when that protection state changes.

A workspace cache uses profile `.`. A user cache commonly has hash-named profiles;
use each exact relative path reported by `cache usage`, not a guessed branch name.
Multiple profiles in one user-wide root can be declared in one policy. Profiles
bind their expected repository identity. References must use the exact declared
profile spelling; duplicate case aliases and conflicting head declarations are
rejected for portability. Paths cannot escape the selected root.

A profile declaration allows review of its unreferenced generations. It does not
register every head as active. Undeclared legacy heads still protect their targets
until their disposition is explicit. A released head must still point to the exact
`snapshotId` in the declaration: if a writer advanced it, review is blocked rather
than treating the newer evidence as disposable. Active heads follow their current
target. In released 0.10.0, previous-generation declarations are manual. The R3b2b
candidate additionally protects the predecessor recorded atomically by new
publishers; `previousSnapshotId` in the policy can protect another selected rollback
snapshot and does not override that tracked protection. Legacy heads have no
inferred predecessor. See [coordination](CACHE-COORDINATION.md#current-and-previous-generations)
for upgrade requirements. Both head references must be accounted for before a
future removal operation can retire the head. Review remains non-destructive.

These declarations control local retention, separately from source approval in
`context-graph.config.json`. They neither approve product assertions nor change
semantic/cache identity. This policy format is the first review contract, not an
active-process registration service or a pin/archive registry discovered from
arbitrary files. Include external reports or other checkouts' exact-replay needs
as explicit pins; an old inventory listing is not automatically a pin.

## Preview enrollment of a recently used profile

A successful build can write to a profile your existing policy has never declared. The target still counts those bytes. A prepare with zero issues and zero candidates can mean that the new snapshots and indexes are all protected by `profile-not-managed`.

In 0.14.0 the text summary from `cache retention plan`, `prepare` and `maintain` names up to ten uncovered profiles, largest first. The JSON field `history.unmanagedProfiles` lists every matching profile with snapshot and SCIP index file counts and their combined logical bytes. It appears when an inventoried snapshot or index carries the existing `profile-not-managed` reason. The totals cover individually classified files, excluding shared SCIP blobs, references, and files protected for a different reason. After upgrading, regenerate a saved plan if its ID changes when the new summary appears. These figures describe files under the observed paths. They do not establish ownership, last use or how many bytes enrollment would make eligible.

1. Save the JSON output of `weftlet cache retention prepare --root ROOT --policy retention.json --json` outside the cache as `before.json`. In 0.14.0, read `history.unmanagedProfiles` directly. For 0.13.0, the following optional jq query groups undeclared snapshot and index bytes by profile. It works on an existing prepare report.

   ```sh
   jq '[.objects[] | select((.category == "snapshot" or .category == "scip-index") and
        (.reasons | index("profile-not-managed")))] | group_by(.profile) |
        map({profile: .[0].profile, files: length, logicalBytes: (map(.logicalBytes) | add)})' before.json
   ```

2. Match the recently produced snapshot ID to the verified inventory from `weftlet cache usage --root ROOT --verify --json`. Confirm the exact relative profile and manifest repository ID. If the profile contains conflicting identities or its ownership is uncertain, leave it undeclared.
3. Copy the existing policy to `candidate.json` outside the cache. Keep its target, existing declarations and pins. Add the confirmed profile to `profiles` with its path, repository ID, owner and reason. Record the active heads, rollback needs and any externally required historical IDs as described above.
4. Run `weftlet cache retention prepare --root ROOT --policy candidate.json --json` and save the output separately. Compare issues, candidate paths, logical bytes, current/previous heads and pin protection with the first report. Enrollment can expose previously protected generations to future removal. The candidate preview leaves the live policy in place. If you have scheduled maintenance, review its bound policy digest before adopting a changed policy.

## Produce and check a review

```sh
npx weftlet cache retention plan --root /path/to/cache --policy ./retention.json --json > retention-review.json
npx weftlet cache retention check --root /path/to/cache --policy ./retention.json --plan ./retention-review.json --json
```

Planning verifies recognized JSON and hashes snapshot/artifact bytes. On a large
cache this is a full read and can take time; it does not rerun SHACL or prove model
artifact compatibility. Progress goes to stderr. SIGINT/SIGTERM cancels the read.
Default limits match inventory: 100,000 entries and 8 GiB per inspected file.
`--max-entries` and `--max-bytes` can be set explicitly. Check reuses the saved limits
unless overridden. Policy input is limited to 2 MiB; saved review input to 64 MiB.

Each object reports size, disposition, reasons, file revision/hash where available,
required head-removal dependencies and recovery limitations. Review covers ordinary unshared managed snapshots, explicitly released heads and opted-in verified companion indexes.
Current evidence, declared previous generations, active pins and retained heads
protect snapshots. An opted-in [verified companion index](CACHE-REMOVAL.md#reclaim-companion-scip-indexes) follows its selected snapshot. Semantic artifacts, other indexes, receipts, unknown objects, links
and scratch work remain retained. Hard-linked objects are retained even if one
name appears disposable.

A snapshot referenced by a released head lists that head in `removeBefore`.
That is an execution dependency for the future coordinated operation, not a shell
script: removing only the snapshot would leave a dangling head. The planner never
changes either file. Candidate logical-byte totals do not promise that many bytes
of free filesystem space or establish a 10 GiB cap.

Malformed data, missing declared evidence, ambiguous identities, repository mismatch,
dangling heads, possible lease/lock activity and incomplete scans block readiness.
An old PID or old lease timestamp cannot establish that work is abandoned. A blocked
review can still show provisional candidates, but remains non-applicable.

`planId` binds the decision payload, policy, scan limits, root and observed inventory.
Its informational `evaluatedAt` timestamp is excluded so an unchanged state has a
stable identity. `check` verifies the saved decision payload and recomputes current
state. Edited decisions are rejected; changed policy, head bytes, observed file
identity/metadata, candidate bytes or effective pin status make the plan stale.
Exit status 1 means blocked review, stale state, malformed input or a failed read;
the JSON report distinguishes these where available. A passing check is still an
observation, not a reader/writer lock or permission to delete concurrently.

Reports contain local paths, repository IDs and declared owners/reasons. Keep them
private unless reviewed. They do not include graph facts, prompts or source text.

## Configurable history in 0.11.0 and later

[Coordinated prepare/apply](CACHE-REMOVAL.md) and [explicit recovery](CACHE-RECOVERY.md)
support root/repository targets and indefinite retention. See the separate [history configuration guide](CACHE-HISTORY.md) for exact
JSON, CLI init flags, upgrading an already-oversized cache and interpreting overages.

The optional `history` policy field changes which eligible history is selected; it does
not bypass any ownership, reference, review or coordination check. Without it, this
manual policy continues to propose all otherwise eligible history. A configured target
accounts for persistent root data, preserves current/previous/pinned evidence even above
target, and never limits a necessary graph or extraction coverage. Empty apply is a no-op
with no removal journal. Regenerate prepared plans from earlier planner versions.

[Recurring maintenance](CACHE-MAINTENANCE.md) authorizes future snapshot selection through reviewed root and policy IDs. Writers can enable [compact snapshot storage](COMPACT-SNAPSHOTS.md) independently.

## Long-term history

For backups or longer-lived historical evidence, preserve exact snapshot bytes and
their source/configuration/tool manifests, checksums, required artifacts and
validation receipts in an explicitly selected private destination. Verify a restore
before approving local removal. See [snapshot delivery](SNAPSHOT-DELIVERY.md) for
the existing bounded export/import contract and
[long-term guidance](../CACHE-RETENTION-PLAN.md#long-term-history-and-backup-guidance)
for its distinction from planned R6/2.0 archival and remote storage.

### Finish an owner’s work on a bookmark

Available starting with 0.12.0. A scope's head is its bookmark. Record all owners who still need it in the external policy. When an owner confirms the work is finished, add their identifier to `completion.finishedOwners` and bind that decision to the observed snapshot ID. For example, this entry in `activeScopes` records that implementation is finished and validation is still using the bookmark.

```json
{
  "profile": "api",
  "head": "orders",
  "owner": "implementation",
  "additionalOwners": ["validation"],
  "reason": "Orders workflow",
  "completion": {
    "snapshotId": "orders-42",
    "finishedOwners": ["implementation"]
  }
}
```

Run the existing `cache retention prepare --root <cache> --policy <file> --json`. In `completions`, inspect the observed ID, remaining owners, head disposition and snapshot logical bytes, reasons and retained head paths. More than one bookmark can report the same snapshot. Count its path once when totaling bytes. The report reflects registered ownership; register external replay requirements as pins before preparing.

After validation finishes at the same snapshot, include both owners in `finishedOwners` and prepare again. An advanced head, a remaining owner or a hard-linked head stays protected. Review an advanced generation with its owners before changing the expected ID. Indefinite retention protects the bookmark. In target mode the last owner's confirmed completion can retire the bookmark even below the target, while ordinary retention governs the snapshots. Use a separate pin for any rollback generation needed after closure.

Review the entire plan before applying it, including unrelated eligible history. Save the apply command's JSON output outside the cache. Its `completionReceipt` binds the decision to the root, policy and plan and records whether each bookmark was actually removed. Keep the receipt with the task. Remove the scope declaration only after confirming retirement. A missing head blocks a fresh plan until reconciled. Recurring maintenance requires removing completion declarations after manual review. A merge or an old timestamp never marks an owner finished.
