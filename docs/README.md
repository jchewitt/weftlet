# Weftlet documentation

Start with the path that matches your task:

| I want to… | Read |
| --- | --- |
| Understand what Weftlet does and install it in my repo | [Project guide](guides/PROJECT-GUIDE.md) |
| Learn by changing the bundled public example | [Document Search tutorial](tutorials/DOCUMENT-SEARCH.md) |
| Connect Codex, Claude Code or OpenCode and install the skill | [Agent setup](guides/AGENTS.md) |
| Install/update project skills automatically | [Project skill setup](guides/PROJECT-SETUP.md) |
| Register and verify project MCP tools | [Automatic MCP setup](guides/MCP-SETUP.md) |
| Adapt setup to an existing project | [Assisted setup](guides/ASSISTED-SETUP.md) |
| Install managed GitHub workflows | [CI setup](guides/CI-SETUP.md) |
| Generate evidence in CI and deliver it to developers | [CI and evidence delivery](guides/CI.md) |
| Transfer a verified saved snapshot to a local project | [Snapshot delivery](guides/SNAPSHOT-DELIVERY.md) |
| Configure history targets/indefinite retention (candidate) | [History policy](guides/CACHE-HISTORY.md) |
| Schedule reviewed history cleanup across new generations | [Recurring history maintenance](guides/CACHE-MAINTENANCE.md) |
| Remove reviewed history (candidate) | [Coordinated removal](guides/CACHE-REMOVAL.md) |
| Recover interrupted cache operations (candidate) | [Offline recovery](guides/CACHE-RECOVERY.md) |
| Coordinate cache readers and builds (candidate) | [Cache coordination](guides/CACHE-COORDINATION.md) |
| Review active scopes, pins and retention candidates | [Retention reviews](guides/CACHE-RETENTION.md) |
| Measure local graph/cache storage | [Cache inspection](guides/CACHE-INSPECTION.md) |
| See what changed between releases | [Release overview](RELEASES.md), [toolkit changelog](../CHANGELOG.md), [core changelog](https://github.com/jchewitt/weftlet/blob/main/packages/core/CHANGELOG.md) |
| Understand authority labels and resolve unapproved/conflicting evidence | [Evidence decisions](guides/EVIDENCE-DECISIONS.md) |
| Configure a model provider | [Provider reference](PROVIDERS.md) |
| Browse or export a graph | [Viewer](VIEWER.md), [portable reports](PORTABLE-EXPLORER.md) |
| Check onboarding qualification and remaining manual checks | [Onboarding qualification](ONBOARDING-QUALIFICATION.md) |
| Assess a real-project trial | [Consumer trial](CONSUMER-TRIAL.md), [validation evidence](VALIDATION.md) |
| Contribute or understand upcoming work | [Roadmap](ROADMAP.md), [0.10 plan](RELEASE-09-10-PLAN.md), [2.0 plan](WEFTLET-2.0-PLAN.md) |

The guides describe the **0.10.0 release scope** unless explicitly marked as a later candidate. Check the [release overview](RELEASES.md)
and installed package changelog for availability; a guide is not proof of npm
publication. Manual setup paths remain documented for 0.9 installations.
Client examples do not establish live authentication or agent behavior. Storage
inspection and retention reviews are included; applying removal, configurable history retention
and hosted approval remain separate work.

## Detailed graph and implementation references

These references retain the exact contracts behind the introductory README.

| Topic | Reference |
| --- | --- |
| Committed code selection and repository adapters | [TypeScript source indexing](ADR-010-committed-source-indexing.md), [canonical file nodes](ADR-020-canonical-physical-file-producers.md) |
| Document links and asynchronous routes | [Document links](ADR-011-explicit-document-links.md), [routing declarations](ADR-014-routing-declarations.md) |
| Exact neighborhoods, bounded paths and ranking | [Neighbors](ADR-029-exact-graph-neighborhoods.md), [paths](ADR-030-bounded-evidence-paths.md), [indirect relationships](ADR-042-indirect-local-relationships.md), [shared symbols](ADR-043-shared-symbol-specificity.md) |
| Symbols, calls and intent mappings | [SCIP evidence](ADR-032-scip-code-evidence.md), [document bindings](ADR-033-document-symbol-bindings.md), [static calls](ADR-035-static-call-evidence.md), [optional proposals](ADR-039-mapping-proposals.md) |
| Producer/consumer obligations and comparison | [Declarations](ADR-036-contract-obligation-declarations.md), [compatibility](ADR-037-selected-contract-compatibility.md) |
| Code coverage and strict validation | [Monorepo coverage](ADR-038-monorepo-code-coverage.md), [SHACL validation](ADR-017-shacl-validation-union.md) |
