# Bounded proposal evaluation

The maintainer approved implementing and evaluating opt-in mapping proposals on November 2,
2026. This directory predeclares a three-request **live** check before any provider measurement.
The source fixture and protocol hashes are in `inputs.lock.json`. Existing deterministic tests
use a visibly canned provider to test plumbing; they do not count as model accuracy evidence.

The public fixture hydrates actual committed prose with its documented grammar, real SCIP and
strict RDF/SHACL. The proposal pass alone uses Codex. It must find the body implementing the
60-second rule despite a misleading function name, abstain on incompatible 30/14-day behavior,
and abstain when a signature-named function delegates to an unavailable implementation. A
lookalike in an unrelated file is excluded by the no-model scope checks. Exact expected labels
are resolved to the fixture's actual indexed IDs; no graph edges are added for scoring.

Review `protocol.json`, the fixture and the no-model test results before authorizing usage.
From a **clean committed checkout**, with Codex already authenticated using ChatGPT:

```sh
pnpm evaluate:proposals --allow-model --max-requests 3 --model gpt-6-astra --reasoning medium --output /tmp/mapping-proposals-live.json
```

This explicitly allows at most three sequential model requests, each with at most eight
candidates and 32 KiB of prompt/schema input, a two-minute deadline, no automatic retries, and
128 KiB of accepted output. These are resource bounds, not a dollar or output-token cap. The
adapter does not report token billing; the report records that as unavailable, never zero. This
runner requires ChatGPT authentication and does not fall back to an API key. The production
provider also supports the existing explicit API-key configuration, tested with fake transport.

All plans must be ready before the first request. The runner checks unchanged artifact reuse
without additional model calls and saves completed public results after each case. Infrastructure
or invalid-output failures stop the run; they are separate from semantic misses. A new invocation
creates a fresh fixture and may spend a new budget. Generated raw reports stay local until review.

Acceptance requires all three predeclared target/abstention sets, valid source/code citations and
zero forbidden targets, followed by independent review of rationale and omissions. File-only
context supplies no exact binding; explicit Markdown bindings remain the deterministic baseline.
This tiny study cannot establish general precision or autonomous-agent usefulness. The larger
B3 assessment, B6 tasks and private consumer acceptance remain separate evidence. No live result
or package qualification is claimed by this protocol.
