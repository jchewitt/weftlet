# ADR-018: Preserve Codex artifacts across operational configuration changes

Status: accepted and implemented in development source after 0.3.0; release evidence is recorded
in [validation](VALIDATION.md). This increment does not claim a new npm publication.

## Problem

With `storageScope: "user"`, the storage profile includes the entire configuration and checkout
path. Increasing a timeout therefore selected a different directory even though the built-in
Codex artifact key already excluded that timeout. A partially completed run could lose access
to reusable work without any source or extraction-contract change.

Custom provider modules present a different boundary: they receive the entire semantic
configuration and may use it to affect their output. Their identities must remain conservative.

## Decision

Keep `resolveStorageRoot`, snapshot profiles, snapshot IDs and full configuration digests unchanged.
For built-in Codex with user storage, use a separate semantic-artifact partition. Its identity
includes the resolved checkout and full configuration except these five semantic controls:

| Setting | Why it can share successful Codex artifacts |
| --- | --- |
| `timeoutMs` | Bounds execution; it does not change the prompt or model arguments |
| `retries` | Limits retries of supported transient failures |
| `concurrency` | Schedules independent source extractions |
| `maxDocuments` | Bounds the selected workload |
| `maxSourceBytes` | Bounds each source; it never truncates its contents |

Document and byte limits still apply before hydration, including when every artifact is cached.
Changing a limit does not waive it. Model/reasoning settings, prompt/schema/extractor/adapter/
ontology identities, confidence/unresolved policy, authentication descriptors, source identity
and bytes continue to invalidate reuse through their existing artifact keys and/or partition.
Unknown configuration fields remain identity inputs. Credential environment values are not read
or added to the cache partition.

The new user-cache layout is `~/.cache/context-graph/semantic-artifacts-v1/<partition>/artifacts/semantic/`.
The partition uses a full SHA-256 digest. Different checkouts, repository IDs, namespaces and
non-operational configurations remain separate. Workspace storage retains its existing paths
and behavior; it already allowed built-in Codex reuse after these operational changes. Modules
retain their full semantic-config identity and their existing storage profiles. Sharing a custom
workspace storage directory remains an explicit operator choice, not a new global cache feature.

Artifact keys and output digests retain the 0.2.1/0.3.0 contract, including the repository-document
identity policy introduced in 0.2.1. No incompatible 0.2.0 artifact is reinterpreted as current.
Source approval and assertion review remain distinct; this change never approves an assertion.

## Legacy recovery without model work

The planner and hydrator use the same store factory. It may read the exact legacy user profile
derived from the current full configuration after checking the new primary store. A corrupt or
unreadable primary entry stops reuse; a valid legacy entry does not mask it. Planning remains
read-only. Hydration can atomically retain a validated legacy artifact in the new partition, then
revalidate the retained entry to handle concurrent winners. Original files, artifact identities,
source provenance and raw provider output remain intact.

Legacy profile directories contain no reliable checkout/configuration ownership manifest, and an
interrupted run may have no snapshot. Consequently, the toolkit never scans sibling profiles for
a matching key. If settings were already changed, the old location cannot safely be inferred.

The explicit `cache adopt --from-config <previous.json>` command handles that case without
providers, authentication probes, indexing, ontology compilation, adapters or snapshot writes.
Both configurations must resolve to the same checkout and have the same non-operational
partition identity. Keep the exact old configuration in its original configuration directory.
Relocation is safe only when its original, unchanged `repositoryRoot` still resolves to the same
checkout (for example, an absolute root). Do not edit that field to compensate for relocation:
it is part of the old profile identity. Preserve the original field values and omissions.

Adoption resolves a committed ref and uses the same configured/agent selection as the hydration
preview. It looks up only expected keys in the exact old profile, checks the complete artifact
contract and output digest, and copies valid candidates atomically. `--dry-run` performs no writes.
Reports identify reused/adopted/planned/missing/corrupt/unavailable/conflicting entries, configured
budgets and scope omissions. They omit source bodies, raw provider output and configuration values.

Recovery is per artifact: valid copies can complete even if another entry is corrupt or conflicts.
The report records partial progress and exits unsuccessfully for problems or incomplete scope.
Missing artifacts are ordinary future extraction work. Corrupt complete artifacts are retained
for diagnosis; they require an explicit forced refresh or operator repair, not automatic overwrite.
Incomplete temporary files are not published artifacts and do not satisfy a cache lookup.

Concurrent writers use immutable publication. Different outputs under one key are reported as
conflicts; a matching `outputDigest` field alone is insufficient to accept malformed metadata.
Explicit forced extraction still creates a separate revision and preserves existing artifacts.

## Freshness and limits

Semantic reuse does not reuse a snapshot's validation result, skip SCIP or SHACL, or let old
configuration evidence satisfy current validation. A timeout change still changes the snapshot's
full configuration digest and user storage profile. Saved evidence remains available under its
original configuration; this increment does not consolidate historical snapshot directories.

The current module-provider contract does not promise operational independence. Supporting that
requires a separate tested contract, not silently dropping fields from a provider's identity.
Credential rotation under an unchanged environment-variable name is not detected by this cache;
credentials are neither cache contents nor cache-identity inputs. Existing filesystem access
controls and the configured storage location remain the security boundary.

Validation uses public fixtures, deterministic Codex runners and installed TypeScript indexing.
Live semantic quality and private consumer acceptance remain separate. See the
[1.0 plan](RELEASE-1.0-PLAN.md) for timeout diagnostics and document coverage follow-ups.
