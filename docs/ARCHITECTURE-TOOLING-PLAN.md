# Architecture tooling and reusable code evidence

Status: maintainer-requested direction, November 9, 2026. Resume 0.10 provider and
agent/CI onboarding first. This plan does not create packages or add a new 1.0 gate.

## Outcome

Allow a project to analyze architecture and guide agents without product documents,
semantic extraction, model credentials or a knowledge-graph subscription. Reuse
Weftlet's code evidence and governance capabilities, while the integrated toolkit
continues to connect intent, implementation and validation in one evidence graph.

An architectural skill builder should produce instructions from one reviewed,
versioned policy. It must not create a second policy that diverges from CI rules.
Suggested policies and model findings remain proposals until an owner approves them.

## Proposed boundaries

Keep the work in the existing repository and @weftlet scope. Extract packages only
when a standalone consumer and clear dependency boundary justify their maintenance.
Names below describe proposals, not currently published packages.

| Boundary | Responsibility |
| --- | --- |
| `@weftlet/core` | Neutral graph records, canonical identity, provenance and adapter interfaces; retain the existing lightweight boundary. |
| `@weftlet/code` | Code indexing/extraction and composable implementation evidence, independent of semantic providers. |
| `@weftlet/architecture` | Approved architecture policy, deterministic analysis, scoped exceptions and generated agent instructions; consumes code evidence. |
| Semantic extraction module/package | Optional cited intent/document extraction and linkage. Decide packaging after the code boundary is proven. |
| `@weftlet/toolkit` | Integrated setup, orchestration, saved querying, CLI/MCP and viewer. Existing users retain a convenient entry point. |

Do not require separate code and knowledge databases. They are independently
produced evidence layers with shared identities and provenance, composed when
needed. Knowledge evidence can exist without indexed code; linking and coverage
must report that missing implementation evidence honestly. Architecture-only
consumers must not transitively require a model CLI or authentication.

## Bounded implementation sequence

1. Inventory current indexing/governance imports and assets; demonstrate a public
   code-only consumer with existing APIs before moving packages.
2. Establish canonical architecture policy: domains/layers/module ownership,
   allowed dependencies, explicit rules and scoped exceptions. Build on existing
   dependency-cruiser, ESLint and duplication tooling rather than duplicate them.
3. Generate project agent instructions from the reviewed policy, with source and
   revision references. Check generated instructions for drift from that policy.
4. Run deterministic checks locally, on commits and in CI. Separate proven rule
   violations, missing required evidence and infrastructure failures. Preserve
   existing-debt baselines; new debt needs an explicit scoped exception.
5. Add advisory code-graph-assisted review for duplicated helpers and unsuitable
   module boundaries. Line count does not prove modularity; text clones do not
   prove equivalent business behavior. Never auto-refactor or approve policy.
6. Qualify isolated package installation, CLI/MCP behavior and full-toolkit graph
   equivalence before publishing any additional package.

Acceptance includes allowed/forbidden imports, cycles, scoped exceptions, baseline
regressions and clear incomplete-analysis reporting. Configured size/complexity
limits can be deterministic rules if explicitly approved; architectural judgment
and model uncertainty are not automatic CI failures or passes.

The hosted approvals/backfill product remains in [the 2.0 plan](WEFTLET-2.0-PLAN.md).
