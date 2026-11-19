# ADR 062: Explicit recurring policy maintenance

Status: candidate, November 19, 2026. Follows merged [ADR 061](ADR-061-configurable-history-selection.md)
in PR 107 (`88899bf944e5063560d9cea9cee5dcb7035c4e8d`).

## Decision

Add `cache retention maintain` as a distinct policy-authorized operation. A caller
supplies the exact managed root ID and canonical policy digest from a reviewed
preparation. Those acknowledgements permit fresh selection under that unchanged
policy on future invocations. No install/hydrate/query hook, scheduler, persisted
activation token or implicit collection default is introduced.

Require configured target/indefinite history and an empty `releasedHeads` array.
One-time reviewed head retirement and existing-cache adoption precede recurring
maintenance. Do not infer completed retirement from a missing head, rewrite the
user's policy or create an alternative acknowledgement ledger. Current/previous
heads resolve dynamically; unknown heads protect their references. Explicit pin
expiry remains part of reviewed policy semantics.

Use one exclusive maintenance scope for root/policy verification, full current
inventory, canonical selection and execution. Share the internal owned removal
executor with reviewed apply; do not export an unchecked executor through the public
package API. Preserve journal/recovery schemas. Verify policy before journal creation
and every unlink, and retain per-file identity/digest checks and cancellation.
The new operation additionally refuses any candidate head/prerequisite defensively.

Report selection history and the ordinary removal result together. Protected overage
remains valid and does not limit necessary graphs. No-ops remain journal-free; ordinary
partial failures may be reselected under the same policy on a later run. Pending
journals/interrupted owners still require explicit recovery. Root/policy changes
require new review; reviewed IDs are not a security boundary against a process with
arbitrary filesystem access.

## Qualification and remaining work

Use actual public temporary caches, CLI execution outside a repository, concurrent
maintenance/readers, head advancement, undeclared heads, configured pin expiry,
policy edits during inventory and after durable intent, partial I/O failure,
cancellation, pending-journal refusal, indefinite/under-target no-ops and exact retained
bytes. Keep the installed package smoke and Windows coordination job current.

Scheduling is external. No private consumer cache, live extraction, off-machine
archive, storage-format migration or npm publication is part of R4b. Compact storage
remains R5; historical archive/restore remains optional R6/2.0.
