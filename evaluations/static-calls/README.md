# B3c static call observation

Run `pnpm evaluate:calls` from the development checkout. The fixed public fixture and expected
cases are in `tests/fixtures/static-call-project.ts`; the eight integration tests in
`tests/static-calls.test.ts` enforce the full acceptance boundary. No private repository or
live model/provider is selected by this command. It accepts only an optional report path.

The [2026-10-29 observation](results/2026-10-29.json) used clean source commit
`98eafa99375fdd1d37333409e4e666bf7f5b0924` on Linux/Node 24.19.0. Real hydration produced
237 facts, including 33 static call assertions and nine cited gaps. Cold extraction processed
one public document in 1,189 ms; the unchanged repeat reused it in 1,080 ms with identical
snapshot identity and content digest. This is a small location/isolation fixture, not a
production speed benchmark or model-quality result.

The exact caller/callee request for `analyze` returned all three incident callsite assertions in
two pages, totaling 19,181 JSON response bytes. The run→plan→analyze→normalize→leaf→policy
search found two assertion paths (the repeated callsites remain distinct), examined 52
candidates and exhausted this selected search within its configured bounds. It retained the
rule mapping's inferred/unreviewed authority. Requests, responses, proofs, source hashes,
configuration identity and diagnostic gaps are preserved in the report; the temporary Git
repository and full snapshots are removed after each run.

Read [ADR 035](../../docs/ADR-035-static-call-evidence.md) for the parser selection, static/runtime
distinction, unsupported dispatch, compatibility, validation and remaining consumer acceptance.
