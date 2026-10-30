# Public monorepo coverage acceptance

This deterministic check uses an independent committed repository built from
[`monorepo-project.ts`](../../tests/fixtures/monorepo-project.ts), with one public owner document,
an empty offline provider and actual bundled SCIP/RDF/SHACL. Positive relationships come from
source extraction. No private application, model run, inferred package ownership or injected
positive graph edge is used. This does not measure autonomous-agent usefulness.

The source fixture contains API and execution services, a TSX client, contracts behind a barrel
and exact source alias, a declaration-only external package, an independent selected service
and a same-name omitted service. The root build tsconfig excludes these sources; the configured
source project selects them explicitly. API also has an unrequested unused file, an unrequested
imported file and an empty requested file. Execution calls a missing external dependency.

Expected distinctions were established before execution: selected/indexed independent code
differs from an omitted package; shared contract references must connect actual services/client;
declarations must not become implementation bodies; unresolved calls remain gaps; old inventory
must be unknown. Actual SCIP observation corrected an initial harness assumption: importing a
file outside the explicit entries did **not** cause SCIP to emit that file. Acceptance now
retains that observed omission and its unresolved definition evidence instead of changing the
indexer or pretending compiler resolution is an indexed document.

The [six integration tests](../../tests/monorepo-coverage.test.ts) verify:

- Every inventory `indexed` value against the actual normalized binary SCIP document list,
  including the empty source. Git source/entry selection and code-root selection stay distinct.
- Connections for API/execution/mobile/contracts, zero observed connections for independent and
  omitted services without a no-impact claim, and external declaration/gap reporting.
- Shared saved overview in impact, exact neighborhoods and HTML, with full RDF/projection parity.
- Complete boundary/file pagination (two/one rows per page), changed/tampered cursor rejection,
  missing project versus legacy unknown inventory and missing-snapshot errors.
- Unchanged hydration reuse (one semantic artifact), clean comparison, dirty queries with missing
  providers/indexers, and identical API/CLI/MCP JSON without mutating saved evidence.
- Draft rename/delete replacement, an explicitly expanded committed index selection, retained
  historical content and evidence-state ineligibility for current-diff gates.

Separate unit tests cover source tree regular-file boundaries, synthetic extra indexed documents,
custom indexer unknowns, inventory mismatch, and strict request grammar. Those are isolated
robustness cases, not claims that the real bundled indexer emitted extra documents.

Run `pnpm exec vitest run tests/monorepo-coverage.test.ts src/extraction/code-inventory.test.ts src/interfaces/code-coverage.test.ts`.
The next candidate still needs B6's frozen end-to-end tasks and the real consumer rerun, including
usefulness and missed dependencies separately from hydration success.
