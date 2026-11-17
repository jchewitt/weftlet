# Review cache retention

Included in the **0.10.0 release scope**; see [release status](../RELEASES.md).
These review commands turn the
[cache inventory](CACHE-INSPECTION.md) into an explicit retention review. It names
managed profiles, active heads, previous generations and exceptional historical
pins. Planning and checking read saved data without Git, providers or hydration.
Removal remains a separate coordinated operation in R3b; every R3a report has
`canApply: false`.

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
target; **previous-generation tracking is manual in R3a**. Automatic current/previous
bookkeeping belongs with coordinated publication in R3b.

These declarations control local retention, separately from source approval in
`context-graph.config.json`. They neither approve product assertions nor change
semantic/cache identity. This policy format is the first review contract, not an
active-process registration service or a pin/archive registry discovered from
arbitrary files. Include external reports or other checkouts' exact-replay needs
as explicit pins; an old inventory listing is not automatically a pin.

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
required head-removal dependencies and recovery limitations. The first review can
propose only ordinary, unshared, managed snapshots and explicitly released heads.
Current evidence, declared previous generations, active pins and retained heads
protect snapshots. Semantic artifacts, indexes, receipts, unknown objects, links
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

## What comes next

R3b adds reader/writer/GC coordination, active-scope registration, transactional
current/previous references, stale-plan checks under exclusive coordination and
bounded crash recovery before enabling reviewed removal. R4 adds budget reservations,
peak-growth enforcement and a disk floor. R5 qualifies compact storage based on the
[representation study](../assessments/storage-profile-r2.md). Until then, these
commands help inspect and review retention without altering existing evidence.
