# 0.9 blocker repair and 0.10 integration onboarding

Maintainer-authorized sequence, November 9, 2026: release the canonical file-kind
blocker independently, then agent/CI onboarding in the next minor. Target versions
are 0.9.0 and 0.10.0 for the fixed core/toolkit pair. 0.9.0 is now published;
0.10 is in progress. Earlier EQT and PM saved-query acceptance remains valid
within its recorded scope. Official 1.0 remains a separate release decision.

## 0.9 — Canonical semantic file contract

Progress: F1–F5 upstream work is complete. Core/toolkit 0.9.0 was published
from `122deea05d33359cef87298a4c1803bc61b4e177` after PRs 83/84 and hosted
qualification. Both public archives match the prepared release SHA-512 values.
The maintainer subsequently reported that TradePilot looks good; that is a
consumer status report, not a replacement for an exact-commit validation ledger.
See [ADR 046](ADR-046-semantic-physical-file-validation.md) and [validation](VALIDATION.md).

Consumer report: 0.8.1 exact-commit extraction reused 19 artifacts and extracted
two. Assembly produced 574,445 facts / 178,028 nodes; one physical-file identity
had both Evidence and Component kinds. Identity preflight stopped before SHACL
or publication. All 21 selected artifact fingerprints were retained. A read-only
follow-up confirms the public `repositoryFileNode` factory returns Component for
the omitted path. No private path or graph payload is needed upstream.

| Task | Acceptance |
| --- | --- |
| F1: Reproduce boundary failure | Public workflow `verifiedBy` a non-test code file, plus two documents linking that same file; reproduce accepted semantic Evidence conflicting with canonical Component. |
| F2: Enforce the existing physical-file contract | Check reserved non-document file identities at fresh semantic validation, cache reuse and linker ingress. Reject incompatible kind/namespace without coercion, deleting assertions, renaming to avoid joins, or weakening strict validation. Retain the established document normalization behavior and independent business-concept IDs. |
| F3: Clarify extraction guidance and identity | Explain that a `verifiedBy` relationship does not override a file's kind. Deliberately version artifact/assembly acceptance; retain historical snapshots and artifacts. Diagnose invalid output without logging private paths, labels or prompts. |
| F4: Qualify composition and preservation | Correctly typed fresh extraction → strict SHACL → persist/read → unchanged reuse. Verify exact predicates, citations, confidence, authority and source bytes; malformed fresh/cached inputs must fail before write or head replacement. Production/test/spec/document controls remain. |
| F5: Review and release | Run existing supported release checks, review the focused diff, publish 0.9.0 through normal release automation, record exact artifacts. Consumer reruns within its own approved budget; upstream does not claim recovery before that evidence. |

An invalid model assertion cannot safely be repaired by selecting the kind that
happens to make a graph conform. This increment rejects it early. A subsequent
provider response must obey the existing physical identity contract. No automatic
model retry, private hydration, cache editing or policy approval is authorized.
Policy-1 artifacts are not reused under policy 2: selected sources without a
policy-2 artifact require fresh extraction. Use the no-model plan to assess reuse
and cost before any consumer run. A passing public deterministic provider
is not evidence of live model compliance.

## 0.10 — Provider choice, agent and CI onboarding

Maintainer clarification: a Claude user must be able to extract with Claude and
query with Claude without installing or authenticating Codex. OpenCode must
likewise have a supported extraction path through its configured provider,
without requiring Codex. Client registration and extraction are separate
interfaces, but both are necessary for the advertised end-to-end integration.
No silent provider or billing fallback is permitted. Preserve the working Codex
path and its account-login option. Implement and qualify adapters incrementally.

- P1: Claude Code CLI extraction and optional mapping proposals; explicit account
  login or API-key configuration, shared schema/citation/identity validation,
  bounded output, cancellation, retries and provider-specific cache identity.
- P2: OpenCode extraction through a verified CLI/API contract and its configured
  backend; document supported authentication and permissions rather than treating
  arbitrary executables as interchangeable. No Codex dependency.
- P3: Provider-aware init/doctor, no-model planning, fresh extraction and unchanged
  reuse, invalid-output/failure preservation and no accidental cross-provider
  cache reuse. Actual authenticated runs are recorded separately from mocks and
  configuration/CLI-contract probes.


Current increment: P1 and the provider-selection portion of P3 are implemented
locally ([ADR 047](ADR-047-provider-choice.md)). Claude uses its own account/API authentication, extraction, mapping
proposals and cache identity. Deterministic qualification is recorded in
[validation](VALIDATION.md); live authenticated runs, publication, P2 and I2–I7
remain open. This is not a completed 0.10 release. Reconcile candidate/support
wording in README and provider documentation with the final qualified feature set
before publishing 0.10; do not leave shipped functionality labeled as future work.

Evidence source: the maintainer's sanitized TradePilot integration handoff dated
November 9. Treat its workflow sketch as reference, not executable configuration.
Codex use and fresh MCP parity are consumer-tested; Claude Code/OpenCode are not.
Fedora/openCAESAR/private HTML delivery was recorded on 0.7.5, not a new 0.8.1
hosted-viewer pass. There is no automatic CI-to-desktop snapshot synchronization.

Initial I1 source audit (0.8.1 source plus acceptance docs at `68de71d`):

- `init` writes JSON configuration and a storage ignore entry; it does not install
  agent instructions or register MCP clients, and refuses existing config files.
- The package already ships `templates/context-graph-development/SKILL.md`, and
  MCP initialization already supplies progressive-query and authority guidance.
  Reuse these rather than creating a conflicting second policy.
- MCP advertises the hard-coded version `0.1.0` in `src/interfaces/mcp.ts`.
  Add accurate installed-package identity to the onboarding increment.
- `action/action.yml` runs this toolkit's package qualification scripts. It is
  not a generic consumer snapshot-generation workflow. The new examples must
  invoke the installed consumer CLI and explicitly configure storage/artifacts.
- Existing README setup is CLI/config focused. Client-specific registration,
  skill placement, snapshot acquisition and CI-to-local delivery need an explicit
  end-to-end walkthrough. Do not promise automatic synchronization.

| Task | Scope and acceptance |
| --- | --- |
| I1: Audit existing setup surfaces | Inspect `init`, packaged skill, MCP instructions, public adapter hooks and action. Inventory implemented vs missing behavior before adding new commands. Verify MCP advertised version against the installed package. |
| I2: Shared agent workflow | Package instructions for owner/task/file queries, evidence authority, bounded follow-up, citations, gaps, stale evidence and explicit generation. Installing MCP alone must not imply the agent follows these rules. |
| I3: Client profiles | Verify current official Codex, Claude Code and OpenCode configuration/skill-discovery contracts. Share instruction content, use client-specific registration, and document tested vs configuration-only support. Query clients are distinct from extraction providers; P1–P3 supply the corresponding end-to-end extraction support. A client profile alone is not a completed provider integration. |
| I4: Safe local setup helper | Preview intended files, use explicit root/config paths, preserve existing configuration, refuse conflicting writes, and keep protocol stdout clean. Test alternate cwd, Windows paths, repeat setup and failure cleanup. Adapter compilation is an explicit project hook, not arbitrary generated build execution. |
| I5: CI examples | Separate credential-free deterministic checks from opt-in trusted semantic generation. Default RDF backend; optional openCAESAR appendix. Pin tool versions, checkout exact SHA, use bounded plans, strict validation, explicit artifact retention and protected credentials. Test workflow syntax and generic no-model commands. Do not install authenticated workflows automatically. |
| I6: Evidence delivery tutorial | Explain private artifact/cache handling, integrity/commit/config checks, download/select steps, and last-valid-head preservation. State that an HTML report is not a snapshot store. Document portable and local explorer options; deployment remains a separate milestone. |
| I7: Fresh-consumer qualification | Exercise packaged instructions/assets and local setup with public fixtures; verify CLI/MCP initialization and saved queries. Mark actual client sessions and provider authentication separately from generated config tests. No paid runs without an approved budget. |

Prefer toolkit support for repeatable local setup and copyable examples for CI,
runner provisioning and deployment. Never copy consumer domains, authority rules,
business adapters, private data or credential values. Preserve Codex ChatGPT login
as an option; API-key usage is optional, not a prerequisite for querying evidence.
Semantic caches can contain raw model output and must not be published by default.

The [architecture-only direction](ARCHITECTURE-TOOLING-PLAN.md), new viewer/hosting milestone and the [2.0 plan](WEFTLET-2.0-PLAN.md) remain
separate. This work does not add remote databases, hosted AI, source backfill or
approval workflows.
