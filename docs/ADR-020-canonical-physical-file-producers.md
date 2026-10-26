# ADR-020: One physical-file policy for deterministic producers and adapters

Status: implemented in development source after 0.3.0; release/consumer acceptance is recorded
separately in [validation](VALIDATION.md).

## Reported defect and ownership

The consumer's bounded replay of installed 0.3.0 extractors reported 120 conflicting file IDs:
34 from the neutral contract extractor alone, 57 from its local framework adapter alone, and
29 from both. Actual file/SCIP extraction classified spec/test files as `Evidence`; contract
consumers and local framework nodes could classify those same physical IDs as `Component`.
The consumer isolated a neutral file-plus-contract pair that failed strict SHACL single-kind
validation. This is an extraction identity defect, not conflicting product intent.

Upstream owns the neutral policy and producers. The consumer owns its framework call sites and
their tests. This work uses public fixtures; it does not reproduce all private IDs, modify the
consumer repository, patch installed packages or claim successful consumer hydration.

## Public contract

Move the existing pure `repositoryFileNode(path)` implementation into `@weftlet/core` and export
it publicly. Its module imports only the `GraphNode` type; core gains no runtime package
dependencies. Keep the toolkit's internal re-export for compatibility, but adapters should use:

```ts
import { repositoryFileNode } from '@weftlet/core';

const file = {
  ...repositoryFileNode(path),
  attributes: { /* adapter-specific evidence metadata */ },
};
```

The caller supplies a repository-relative path in its canonical spelling. Existing mappings stay
unchanged: `.md`, `.mdx` and `.txt` use `document:<path>`/`Document`; `.spec.<extension>` and
`.test.<extension>` use `component:file:<path>`/`Evidence`; other physical files use that file
prefix and `Component`. Matching ignores extension case but preserves path spelling. This is not
filesystem resolution, universal test detection, proof of existence or approved intent. Do not
rewrite business concepts, contract identities or architectural modules into physical-file IDs.

The producer audit is explicit:

| Producer | Change |
| --- | --- |
| Neutral file extractor | Replace duplicated kind logic; preserve source/index attributes |
| SCIP symbols | Replace duplicated kind logic; preserve symbols, sites and citations |
| Contract consumers | Replace hard-coded Component; retain conceptual contract and evidence IDs |
| Document linker | Import the public factory; existing owner/reference behavior stays intact |
| Routing | Replace duplicated mapping; document endpoints now join document identities |
| Governance | Use the factory for dependency and membership files and query lookup; retain module/layer concepts |
| Semantic normalization | Use the shared factory for its existing document-only normalization; see the boundary below |

Facts are retained, including test files with mocked client calls, DI and decorators. We do not
suppress test evidence, rename conflicting IDs, weaken kind cardinality or change source/assertion
authority. Graphs and all working overlays require strict SHACL before publication; overlay
validation no longer depends on routing being configured.

## Identity, saved evidence and artifacts

Contract extraction advances from 1.1.0 to 1.2.0; routing and SCIP fact extraction from 1.0.0 to
1.1.0; governance analyzer from 2 to 3. The SCIP indexer/tool version is unchanged. Committed
assembly becomes `standalone-graph-v7`, with `graph-v7`, contract and SCIP fact identity included
in snapshot IDs. Overlay IDs/metadata also bind assembly, contract and SCIP fact identity,
so rebuilding identical captured bytes cannot replace an older overlay. Governance records its
analyzer identity in both snapshot digest inputs and metadata.

Current validation requires matching assembly, contract and SCIP fact versions, plus routing version when
configured. Missing metadata is not a pass. Final checks reject old versions without initiating
hydration. Historical saved queries still return the original facts, with extraction compatibility
reported separately from commit/configuration/working-overlay freshness in JSON, Markdown and
the viewer. Saved queries remain ineligible to validate a current diff.

The physical policy itself was already correct. Its semantic cache identity stays at version 1;
provider/prompt/artifact keys and original artifact bytes remain unchanged. The original snapshot
and any compatible semantic artifacts remain available. A fresh graph must still be assembled,
indexed and validated. Reuse does not imply that an old graph passes current validation.

## Semantic and consumer boundary

The reported 120 conflicts were reproduced entirely by deterministic producers. This fix does
not rewrite semantic caches or force paid re-extraction to hide that defect. Existing semantic
normalization continues correcting repository document IDs/kinds only. Non-document model kinds
remain asserted, inferred and unreviewed; an incompatible model assertion still fails strict
SHACL. A broader interpretation migration would need separate provenance/OML parity tests and
an explicit cache/assembly decision. It is not silently bundled into this deterministic fix.

After upgrading both packages to the reviewed public release, the consumer must change every
physical-file node emitted by its framework adapter to the public factory and version that
adapter's extractor deliberately. Add actual adapter regressions for Prisma/DI/decorator-bearing
spec/test files composed with neutral file facts. Do not change semantic provider/prompt policy
versions merely to perform this deterministic adapter migration. Preview compatible artifact reuse,
then run full hydration and repeat acceptance against the committed adapter update.

Public upstream tests compose actual committed-source extractors, real TypeScript indexing,
document and routing links and a public adapter-shaped fixture. They assert strict SHACL,
provenance, confidence, authority, stable conceptual identities, saved-byte preservation and
version guards. They do not establish the private adapter's acceptance or semantic quality.
