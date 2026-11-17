# Deliver a saved graph from CI to your project

[Documentation home](../README.md) · [CI guide](CI.md) · [Agent setup](AGENTS.md)

Included in the **0.10.0 release scope**; check [release status](../RELEASES.md).
Use matching core/toolkit versions on both ends. For existing 0.9 installations,
see [manual staging](CI.md#manual-staging-for-09-or-customized-delivery).

Use snapshot delivery when trusted CI or another workstation has already built
the evidence that your local agents and viewer should query. The bundle preserves
that exact graph. Both ends need a reviewed local Weftlet configuration and a Git
checkout with the same `repositoryId`. A matching checkout commit is useful but
not required for historical queries; the report tells you when evidence is stale.

## 1. Export the selected CI snapshot

After your normal bounded hydration succeeds, retain its JSON receipt. For example,
on a trusted Bash runner:

```sh
pnpm exec weftlet hydrate --json --quiet > hydration.json
snapshot_id="$(node -p 'JSON.parse(require("node:fs").readFileSync("hydration.json", "utf8")).snapshotId')"
pnpm exec weftlet snapshot export \
  --snapshot "$snapshot_id" \
  --output delivery/weftlet > delivery-receipt.json
```

`--output` must be a new directory. The export verifies the saved graph, writes
its exact JSON bytes and a manifest, and reports `manifestSha256` in the receipt.
Its source snapshot/head remain unchanged. An explicit `--config path.json`
works for nested projects and scoped configurations.

Retain the bundle through your reviewed CI artifact/private storage mechanism and
keep the receipt bound to the successful run and commit. `setup ci` deliberately
leaves upload/access policy to your project. Add the export step after hydration
and upload only `delivery/weftlet` and the receipt through the access-controlled
channel you choose. Short CI artifact expiry is separate from local retention.

Snapshots contain product/code evidence and citations. Review access before
uploading, especially in public repositories. No credentials or repository source
tree are collected by this export command, but source excerpts/attributes already
present in graph evidence remain part of the snapshot.

## 2. Download and verify locally

Download into a new directory using your authenticated CI/storage client. Obtain
`manifestSha256` from the trusted run's receipt. A checksum supplied by an unknown
sender establishes no producer trust. Then run from your local project:

```sh
pnpm exec weftlet snapshot import \
  --input /path/to/downloaded/weftlet \
  --expect-digest MANIFEST_SHA256_FROM_TRUSTED_RECEIPT \
  --dry-run
```

This checks every listed byte, the canonical persisted graph digest, graph identity
consistency and strict SHACL/evidence constraints. It reports source/configuration/
extractor compatibility and excluded working changes. The dry run uses temporary
disk space for verified copies and removes those copies afterward; it installs no
snapshot/cache artifacts and changes no head. An empty transfer directory may remain.

Remove `--dry-run` to install the verified snapshot. By default it is queryable by
its exact ID, without changing the graph selected by existing agents:

```sh
pnpm exec weftlet snapshot import --input /path/to/downloaded/weftlet \
  --expect-digest MANIFEST_SHA256_FROM_TRUSTED_RECEIPT
pnpm exec weftlet impact scan --snapshot SNAPSHOT_ID --owner-doc docs/search.md --json
pnpm exec weftlet viewer serve --snapshot SNAPSHOT_ID
```

Transfer itself needs no provider, Docker, project adapter or model credential.
The ordinary query commands retain their normal configuration/adapter requirements;
the read-only viewer can inspect saved evidence without initializing those producers.
Your working files and source-authority configuration are unchanged.

## 3. Select it for default agent queries

Activation is explicit. On a new compatible local store:

```sh
pnpm exec weftlet snapshot import --input /path/to/downloaded/weftlet \
  --expect-digest MANIFEST_SHA256_FROM_TRUSTED_RECEIPT \
  --activate --expect-head none
```

If a head already exists, pass the exact current snapshot ID from your existing
saved-query response instead of `none`. If another writer advances it during
import, activation fails and that writer's head remains selected. Inspect the
new state before retrying; do not substitute `none` to bypass the comparison.

The receiving config and extractor versions must match for activation. Ordinary
configurations use the default head; agent-scoped snapshots use their recorded
scope-derived head. Scope/config mismatches can still be imported by ID for
historical inspection. A snapshot from another repository identity is rejected.
Reconnect an already-running desktop MCP client to start a fresh reader when
needed. Import does not remotely restart clients.

All transfer reports keep `eligibleForCurrentDiffValidation: false`. Even when
the commit matches, import checks structural evidence integrity; it does not
rerun project invariant evaluators, independently hydrate the graph, or approve
inferred assertions. Follow your normal current-diff validation/review workflow.

## Optional: carry reusable semantic extraction artifacts

Add `--include-semantic` **at both export and import** to transfer/adopt the exact
selected semantic artifacts. They include raw extraction output, so review the
privacy implications before export. Snapshot-only export is the default.

Import verifies artifact content, exact cited Git source bytes and the local
model/prompt/extractor/adapter/ontology contract. Fetch the relevant Git revisions
through your usual authenticated Git flow if absent. An incompatible artifact
fails explicit adoption; it does not trigger model work or overwrite a cache.
You can import the graph without `--include-semantic` to query it independently.
Compatible artifacts are reused by later hydration under its ordinary cache rules.
Forced-refresh keys stay forced-refresh keys; they are never relabeled as ordinary
cache hits. SCIP indexes and compiler environments are rebuilt when needed.

## Limits and recovery

- The default `--max-bytes` is **2147483648** (2 GiB of payload). Both commands accept
  an explicit integer up to 17179869184 (16 GiB). The manifest has a separate 1 MiB
  limit; at most 512 optional semantic artifacts are supported. Copy counters
  enforce the payload limit and preflight keeps a 256 MiB free-disk margin.
- Export needs space for one new bundle. Import stages one payload copy before
  linking installed files; identical existing files still need staging space.
  Validation holds the graph object in memory. Large graphs still need appropriate
  Node heap limits. These limits are not the planned user-wide 10 GiB cache policy.
- Existing snapshots/artifacts are immutable. Different bytes for the same ID/key
  cause a collision, even if only formatting changed. Inspect the two producers;
  do not delete current evidence or edit digests as a shortcut.
- Symlinks, junctions and hardlinked input files are rejected. Use ordinary
  controlled directories. Optional cache installation must share the staging
  filesystem so complete files can be atomically linked.
- Failed validation never advances a head. A later installation/activation failure
  may leave valid unselected files already installed. Normal failure/cancellation
  removes its staging. After a crash, confirm the writer is stopped before removing
  its operation-owned `transfers/import-UUID` directory or reported head lock;
  never remove snapshots or another active operation's files as recovery.
- V1 delivery supports committed hydration snapshots. Export a committed base
  instead of a working overlay; architecture-only snapshots are outside this format.

The original producer `contentDigest` is preserved. Its legacy pre-persistence
encoding is not always reconstructable from JSON; the report states
`producerContentDigest: "preserved-not-recomputed"`. Transfer independently checks
the entire persisted graph with `persistedGraphDigest` and the trusted exact-byte
hashes. See [ADR 052](../ADR-052-snapshot-delivery.md) for the encoding decision.
