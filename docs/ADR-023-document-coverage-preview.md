# ADR-023: Prospective committed document coverage

Status: implemented as T07a after T06; source validation and publication are separate in
[validation](VALIDATION.md). T07b classification/evidence and T07c hydration integration remain planned.

## Decision

`weftlet documents plan` and `planDocumentCoverage()` inspect the committed Markdown-link closure
from explicit entry points. The report is `document-coverage-plan`, with `mode: prospective` and
`changesHydrationSelection: false`. It is separate from `hydrate --plan`, whose inputs and cache
estimates continue to describe actual hydration. No provider, adapter, indexer, cache, snapshot,
runtime source or ontology compiler is initialized or written by the new operation.

Entry points, exact scope roots and read limits are operation arguments. This increment adds no
hydration configuration fields and changes no cache partitions, extractor versions or graph
assembly identities. Existing config supplies repository identity, explicit approval/evidence-root
labels and semantic budgets for comparison. This avoids making an unused traversal setting
invalidate current snapshots or cached artifacts.

The new NUL-delimited Git tree reader preserves exact committed paths and records type, mode,
object ID and byte size, including directories, symlinks and gitlinks. It scopes correctly to a
nested repository root. Existing Git listing/extraction APIs are unchanged. Invalid UTF-8 tree
paths or malformed metadata fail closed instead of silently disappearing from the index.

A separate canonical-link parser follows direct Markdown links and used reference definitions.
It retains source lines, definition/use positions and conflicting definitions. It does not change
the graph linker's existing treatment of bare and inline-code paths. Images, code examples, HTML
and unused definitions do not become traversal edges. CommonMark-compatible links in Markdown,
MDX and text files are supported; this is not a complete MDX/HTML parser.

Relative paths resolve against their source document, leading `/` means repository root, and
percent encoding and fragment/query removal are explicit. No basename/README guessing or remote
fetch occurs. Malformed/escaping targets, scope exclusions, missing files, directories, symlinks,
submodules and ambiguous references are reported distinctly. Scope roots bound document traversal;
existing regular code/non-document targets outside those roots can still be classified without
reading their contents. Resolved code links, external URLs
and same-document fragments remain visible without being traversed. Visited-path deduplication
terminates cycles while retaining every reaching-link occurrence.

## Coverage and limits

Traversal computes reachable supported documents before comparing extraction budgets. The
existing `semantic.maxDocuments`/`maxSourceBytes` values apply only to that comparison; they never
trim the traversal. Candidates include validation documents at this stage, so totals are not a
promise of future model work. Missing links and unread descendants make coverage incomplete.
`ready` requires complete supported local coverage and a passing budget comparison; it does not
establish approved requirements, semantic quality, complete product coverage or hydration readiness.

Separate read-safety limits default to 1,000 documents, 16 MiB total and 1 MiB per document,
with ceilings of 10,000 documents, 64 MiB and 4 MiB respectively. Committed blob sizes are checked
before reads; failed attempts count toward read limits. Discovered unread paths remain in the
frontier and their descendants are explicitly unknown. Git metadata output is bounded to 64 MiB.
The current string reader conservatively rejects NUL, byte-size mismatches and U+FFFD, including
a literal replacement character, because it cannot prove lossless decoding in that case.

Reports include commit, current configuration digest, coverage digest, paths, sizes, content
digests, citations, issues and excluded working changes, but no document bodies. They are local
diagnostic reports and may contain private paths/link destinations. Source approval matches
remain explicit and do not propagate through links; prospective assertion review stays unreviewed.
Evidence-root labels do not infer rule ownership or approve source assertions.

Before traversal can drive extraction, T07b must preserve validation documents through a separate
deterministic evidence path. T07c must connect the same selection to hydration, cache recovery and
freshness checks, with real cross-source positive/negative fixtures and rename/delete behavior.
