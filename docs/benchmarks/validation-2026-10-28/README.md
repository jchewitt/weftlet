# T05 validation measurements, 2026-10-28

See [ADR 027](../../ADR-027-validation-closeout.md) for decisions, units, methodology and limits.
These files are public metric reports, not graph snapshots. They contain no private consumer data.

| Report | Command after `pnpm build` | Source identity |
| --- | --- | --- |
| [lifecycle.json](lifecycle.json) | `node scripts/validation-benchmark/run.mjs --counts 2000 --samples 3` | Runtime `174f2ae`; harness subsequently committed at `3a7e24d`, per-file hashes in report. That version selected pipeline/shared/unique and ten scenarios. |
| [rich.json](rich.json) | `node scripts/validation-benchmark/run.mjs --counts 2000 --fixtures document-rich --samples 3` | Base `3a7e24d` plus recorded dirty harness paths, subsequently committed at `4e93837`. Adds manifest-only and dense metadata cases. |
| [large.json](large.json) | `node scripts/validation-benchmark/run.mjs --counts 10000 --fixtures unique,document-rich --samples 3 --scenarios cold` | Clean harness commit `4e93837`. |
| [native.json](native.json) | `node --import tsx scripts/validation-benchmark/native.ts /explicit/path/to/rudof` | Base `4e93837` plus recorded probe/fixture paths; exact probe and shared-fixture SHA-256 recorded. |

For the first report with the current harness, explicitly select
`--fixtures pipeline,shared,unique --scenarios cold,repeat,rebuild,insert,update,delete,rename,invalid-confidence,invalid-shared-kind,repair-delete`.
The current default additionally includes dense metadata and manifest-only inputs. Tests contain
no latency thresholds. All measurements use public synthetic inputs or the actual public pipeline
extractor fixture; no paid/model work is performed. Reports preserve all completed case outcomes.

The optional native probe requires Linux, Python 3 and the explicit official
[`rudof_0.3.35_x86_64_linux_gnu` release asset](https://github.com/rudof-project/rudof/releases/tag/0.3.35).
SHA-256: `d9d230e27e594ab5d7927cc021fbdc8b907a014cebfa13722a5521a65ce9ff66`.
The script does not download/install it. The experiment exits **1** because two diagnostic-count
comparisons differ, even though all 29 conformance/location comparisons and all 12 timing cases
complete as expected. That is an explicitly recorded compatibility gap, not an accepted replacement
or a successful exact-parity gate. No native binary/service is required for tests or package use.
