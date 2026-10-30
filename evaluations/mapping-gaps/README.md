# Business-to-symbol mapping assessment

This B3b study measures what remains missing after explicit Markdown symbol bindings. It uses
only the inventoried public project and its deterministic prose grammar. No Codex/API provider,
consumer repository, model-generated output or paid inference is involved. Passing these cases
does not demonstrate natural-language extraction quality, correct implementation of a rule,
successful test execution or readiness for 1.0.

The ten cases, expected states, input hashes and query budgets were committed in `01f7cb6`
before the evaluator first ran. The toolkit baseline is `c607787165759d9bc20a0a030648f6a32f110421`.
The earlier code-extractor comparison under `evaluations/code-graph` remains unchanged.

Run from an installed development checkout:

```sh
pnpm evaluate:mappings
# Optional report location, containing only this public fixture's evidence:
pnpm evaluate:mappings --output /tmp/weftlet-mapping-report.json
```

The evaluator verifies the lock, copies only inventoried inputs into a temporary Git repository,
commits with a fixed identity/date, and runs cold hydration and an unchanged repeat. Hydration
uses real SCIP, RDF/SHACL, artifact caching and snapshot publication. It then measures exact
agent neighborhoods and bounded structural paths against the same saved graph. The temporary
repository and full snapshots are deleted; reports retain actual requests, responses, proofs,
diagnostics, query limits, identity, durations and source hashes. The CLI accepts no alternate
model, provider or consumer configuration. Public fixture inputs are UTF-8 text with LF; CRLF
checkout conversion is normalized before hash checking and copying. Symlinks are rejected.

There are at most ten cases, eight 25-fact neighborhood pages per case, and one path request
per unambiguous target with depth four, three returned paths and 500 candidate-edge steps.
Any unfinished neighborhood invalidates the assessment; path truncation is explicitly reported.
Finding a structural path does not establish a direct rule-to-function mapping.

Cases cover explicit implementation/test declarations, file claims with misleading function
names, ordinary prose mentioning a function without selector syntax, two rules sharing a
document, an ambiguous selector, excluded code, a declaration without a body, a stale selector
and code without intent. The grammar identifies rule/workflow and file-level assertions only;
it never reads code or proposes symbol mappings. Observed states are computed independently of
expected labels. Test declarations and approved document sources retain their separate evidence
authority; extracted assertions are unreviewed.

Recorded results and the inference decision belong in [ADR 034](../../docs/ADR-034-mapping-gaps.md).
