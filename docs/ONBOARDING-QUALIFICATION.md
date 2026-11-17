# Onboarding qualification

S7, November 17, 2026. Candidate implementation record; not an npm publication or
whole-product 1.0 acceptance. [Work queue](1.0-WORK-QUEUE.md) ·
[Tutorial](tutorials/DOCUMENT-SEARCH.md) · [Validation](VALIDATION.md).

## Reproduce the automated tutorial

From a toolkit development checkout with Node 24 and the frozen dependencies:

```sh
pnpm build
pnpm test:onboarding
```

The check packs core/toolkit, installs those exact archives with pinned demo
TypeScript/Vitest dependencies into a new Git project whose path contains spaces,
and follows the no-model tutorial. It also runs inside `context-graph:pack:check`.
Each invocation cleans its own disposable project/archives after success or
failure. It never touches a consumer checkout or requests extraction credentials.

The demo's `types: []` explicitly selects standard language globals. The first
fresh installation exposed incompatible newer ambient Node declarations pulled
through tooling when using TypeScript 5.5; this setting avoids implicitly loading
unrelated declarations into the small runtime-neutral example. It does not relax
the demo's strict source type check or alter consumers' tsconfig files.

## What is checked

| Path | Automated evidence | Qualification boundary |
| --- | --- | --- |
| Fresh installation | Real core/toolkit tarballs, npm install and subsequent `npm ci` in two independent checkouts | Registry publication is separate; these are prepared archives |
| Public demo | Copies shipped example assets, validates config, runs Vitest and source type checks | Demo behavior, not arbitrary application behavior |
| Source selection | Zero-document preview and zero model extraction/reuse; intent coverage remains absent | The no-model path intentionally does not validate prose extraction |
| Skill + MCP setup | Preview/apply, expected plan ID, installed version/tools and readable snapshot through fresh stdio | Actual client UI discovery/trust/loading is manual |
| Existing files | Existing workflow unchanged; repeated setup unchanged; edited skill reports conflict and keeps its bytes | Interrupted multi-file setup is covered by the existing setup regression suites |
| CI checks | Generates selected test/type-check jobs; existing packed CI smoke executes generated no-model commands | No consumer GitHub workflow is dispatched by this test |
| Development loop | Runs the exact test snippet from the packaged tutorial, queries old evidence while dirty, commits and hydrates again | A deterministic script plays the editing role, not an autonomous development model |
| Repeat/freshness | New commit gets a new snapshot, unchanged repeat preserves identity/digest, historical bytes retained | No semantic-cache reuse claim from this code-only path |
| Evidence delivery | Export, verified import preview, guarded activation, saved query and MCP verification in a second frozen-installed checkout | Trusted-channel download/authentication is project-owned |

Other existing qualification remains useful: packaged traversal checks exercise
semantic extraction contracts with a deterministic provider and unchanged artifact
reuse. Generated Codex/Claude/OpenCode registrations are exercised from nested,
relocated and alternate working directories. Setup unit/CLI regressions cover
stale plans, edited targets, recovery and native Windows paths. Those tests do not
substitute for a real logged-in client/model session.

## Platform and live qualification

- **Linux, Node 24.19.0, pnpm 10.18.2:** the independent installed no-model
  walkthrough passed. Full packed-consumer and focused regression results are
  recorded in [VALIDATION.md](VALIDATION.md).
- **Native Windows:** a separate `windows-onboarding` job runs the complete
  packaged walkthrough so it does not add work to the already long storage/startup
  job. The first runs found a cold npm-install deadline and CRLF launcher
  recognition defect. The corrected complete walkthrough passed in hosted job
  [134100002269](https://github.com/jchewitt/weftlet/actions/runs/44100812712/job/134100002269)
  at `f296c84`. Existing
  Windows setup/storage tests remain distinct evidence.
- **macOS:** unqualified and outside the maintainer's current priority.
- **Codex / Claude / OpenCode development clients:** generated configuration and
  fresh MCP protocol checks are automated. Candidate-specific in-client discovery,
  trust/reload and actual agent use remain manual.
- **Live semantic providers and assisted setup:** authentication/model usefulness
  remain provider-specific qualification. No paid or account-login requests were
  made for S7. Preserve previously recorded consumer results without calling them
  a new candidate run. OpenCode subscription/OAuth is still separate future work.

## Short manual acceptance exercise

1. Install the reviewed candidate in a disposable or approved consumer repository;
   retain package versions/integrities and source commit.
2. Follow the tutorial with your chosen development client. Confirm the skill is
   discovered and inspect an actual `impact.scan` call plus one relevant follow-up
   node query. Retain bounded IDs/counts and freshness/authority fields.
3. If evaluating prose extraction, preview the intended governing sources, verify
   the chosen provider's auth mode, approve the bounded run, and record citations,
   publication and unchanged-repeat reuse. Do not count a code-only run as this pass.
4. If evaluating CI delivery, execute the reviewed trusted-generation workflow and
   transfer through your real private artifact channel. Verify/import locally,
   reconnect the client and compare the selected snapshot identity.
5. Record failures/gaps with exact versions and privacy-safe evidence. Keep source
   text, prompts, tokens and complete private graphs out of public issues.

These manual checks remain visible dispositions for candidate/consumer acceptance.
They are not hidden additional implementation tasks. R1–R5 storage work and the
explicit 1.0 release decision remain in the existing queue.
