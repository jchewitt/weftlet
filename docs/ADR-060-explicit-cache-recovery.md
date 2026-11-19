# ADR 060: Exact-state offline cache recovery

Status: candidate, November 19, 2026. Follows [ADR 059](ADR-059-coordinated-retention-removal.md).

## Problem

Coordinating readers/builders and reviewed removal preserves interrupted markers
rather than guessing whether they are abandoned. A killed owner or uncertain cleanup
journal can consequently block future operations. We need an explicit recovery boundary
without treating process age, PID absence or a repeat command as permission to delete.

## Decision

Add separate `cache recovery plan` and `apply --expect-plan --acknowledge-quiescence`
commands. Planning is read-only. Applying requires all cache/recovery clients stopped,
a dedicated exact managed root and the unchanged complete evidence/control inventory.
A live/inaccessible PID vetoes an attempt; PID absence is only diagnostic information.
No distributed lock, same-user adversarial protection or power-loss guarantee is claimed.

A permanent exclusively created claim per plan prevents same-plan competing execution.
Foreign live claims and exact control membership stop different-plan attempts. A barrier
checked before and after ordinary admission gate acquisition blocks new upgraded clients;
an ordinary maintenance gate also covers the removal interval. Older/uncooperative clients
must already be stopped. The recovery claim remains live through final barrier removal.

Before removing reviewed control markers, write/sync an immutable archive of their exact
bytes and the reviewed plan. Recheck physical directories, ownership, membership and file
revisions before each control unlink. Preserve evidence, original removal journals and
recovery receipts. Never replay a pending unlink, create a replacement graph or mutate
semantic authority. Gate removal is last among owner markers; barrier removal reopens
admission. A final receipt failure may follow that reopening and remains a command failure.

A supported pending removal journal is reconciled against complete saved bytes and current
head references. Terminal results and per-file events must agree; an intent without a
completion is not a proven unlink. Changed/unknown candidates, dangling heads, malformed
or missing/truncated logs and invalid receipt linkage block recovery. Those cases require
investigation; this slice does not promise automatic repair of every filesystem failure.

Plan/start archives are bounded to 16 MiB, individual control files to 32 MiB, all controls
to 64 MiB/10,000 entries. Before mutations reserve capacity for the full attempt's peak
control bytes and entries, including final receipts. No partial hidden inventory is accepted.
These are recovery bookkeeping bounds, independent of graph size and R4 retention targets.

## Consequences and validation

Recovery is deliberately manual and exclusive; large complete inventories can take minutes.
It can reconcile a supported interrupted recovery through a new exact plan after quiescence.
Malformed partial records remain preserved blockers. Retention needs a fresh prepare/review
following recovery; prior deletion permissions are not inherited.

Public regressions use real files, killed reader/recovery processes, same/different-plan
concurrency, changed plans/heads, strict marker/receipt/journal validation, links, cancellation,
sync failures, completion-window behavior and capacity preflights. Installed package smoke
creates and recovers an actual killed public-fixture reader. Hosted Windows/Linux results and
limitations are recorded separately in validation and the PR.

R4 follows: configurable history targets, including indefinite retention, must reconcile
preexisting oversized caches after explicit ownership/scope/pin migration. Current/previous/
pinned evidence and reusable artifacts remain protected even above the chosen target. A
necessary graph remains buildable when disk capacity permits. No consumer cache is accessed
or cleaned by this upstream work.
