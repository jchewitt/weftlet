# Recover interrupted cache coordination

**Candidate after 0.10.0; not yet published.** Recovery clears reviewed coordination
blockers so saved evidence can be used again. It preserves graphs, semantic artifacts,
indexes and original removal journals. It never resumes a deletion or starts a model.

## Stop clients and inspect

Stop every process using the cache: CLI builds/queries, MCP servers, viewers, CI jobs,
older clients and other recovery attempts. Use a dedicated local managed root activated
through [cache coordination](CACHE-COORDINATION.md). Shared/network filesystems and
power-loss recovery are outside this qualification. A copied cache from another machine
requires investigation rather than relying on local PID observations.

```sh
npx weftlet cache recovery plan --root /path/to/cache --json > recovery-plan.json
```

Keep the plan outside the cache. This is a read-only, complete JSON/hash inventory;
large graphs can take minutes to inspect. Review `canApply`, `issues`, `actions`,
`journals`, `interruptedClaims` and the exact `planId`. A live or inaccessible PID
blocks recovery even if its marker is old. PID reuse may conservatively block it too.
An absent PID never proves quiescence: stopping all clients is your responsibility.

The plan binds physical root/owner identity, evidence inventory, control file bytes,
scan limits and supported journal outcomes. `--max-entries` and `--max-bytes` change
inventory bounds during planning; the latter bounds each inspected file, not graph
retention. Apply uses those saved limits and rejects overrides.

## Apply the reviewed state

```sh
npx weftlet cache recovery apply --root /path/to/cache --plan ./recovery-plan.json --expect-plan PLAN_ID --acknowledge-quiescence
```

A stale or blocked plan rejected at preflight clears nothing. A later detected change
can stop an attempt after some control markers have already been cleared. The explicit acknowledgement applies to
**all cache clients and recovery processes**, not just the terminal running this command.
Recovery reserves an exclusive claim for this exact plan, establishes an admission
barrier, and checks the complete state again. Only one attempt can claim a plan; a failed
attempt needs a newly inspected plan. Concurrent different-plan attempts fail closed
when they encounter each other's claims or changed control state.

Before clearing any blocker, recovery syncs an immutable receipt containing the plan
and original marker bytes. It checks membership, directory identity and file revisions
before each unlink, clears participant/pending markers first and the gate last, then
reopens admission. Original journals and recovery receipts remain under
`.weftlet-coordination`. These local reports contain paths and evidence identifiers;
handle them as private project artifacts when appropriate.

A complete result reports `evidenceFilesRemoved: 0` and `replayedDeletions: 0`.
It does not restore graphs already removed by a prior reviewed cleanup. A journal
candidate can be `retained-matching` or `absent`; absence with an intent but no completion
record is reported without claiming a proven unlink. Terminal removal results are
also checked, including a deletion whose individual completion append failed.

After recovery, review the reconciled outcomes. If a prior cleanup already retired a
head, update only that confirmed retirement declaration. Create a **fresh retention
prepare plan** before any further removal; recovery is not deletion authorization.

## Failures and limits

- Unknown/malformed owner records, unsupported or truncated/missing pending removal journals,
  changed candidate files, contradictory records and surviving heads pointing to absent
  snapshots remain blocked. Preserve them for investigation; do not manually erase
  markers merely because their PID is absent or they are old.
- A process killed during recovery preserves the records already created. A barrier
  remains if it was created and admission has not yet reopened; an archive exists only
  after that write. Once all clients are stopped again, a new plan can reconcile supported state and
  resolve that dead attempt. No PID/age stealing or automatic replay occurs.
- Failures before admission reopens retain an already-created barrier. Failure writing the final
  completion receipt can occur **after** admission reopens; the command still fails.
  Inspect the actual records before claiming completion. A malformed partial receipt
  remains blocked; a missing receipt can be reviewed with the interrupted claim after
  its process exits. Do not assume every failed command left admission closed.
- Recovery inspection accepts at most 10,000 control entries, 64 MiB total control
  bytes, 32 MiB per control file and 16 MiB per plan/start archive. It preflights the
  peak bytes and entries for its own claim, barrier, gate and receipts before creating
  them. Exceeding these bounds requires investigation, not hidden truncation. These
  bounds apply to control bookkeeping, **not the size of a necessary graph**.
- Other operation-specific locks or scratch directories are preserved. This command
  is not a general force-unlock or temporary-directory collector. No new SHACL or
  current-diff acceptance follows from inventory inspection.

For normal cleanup, see [reviewed history removal](CACHE-REMOVAL.md). For the planned
configurable retention target and upgrades of oversized existing caches, see the
[storage plan](../CACHE-RETENTION-PLAN.md#existing-cache-upgrades).
