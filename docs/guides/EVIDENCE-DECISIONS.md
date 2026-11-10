# Act on evidence: authority, gaps and user decisions

[Documentation home](../README.md) · [Project guide](PROJECT-GUIDE.md) ·
[Source authority configuration](PROJECT-GUIDE.md#configure-source-authority-no-per-document-acceptance) ·
[Agent setup](AGENTS.md)

This is the decision guide for using results, not just generating a graph.
Current Weftlet labels evidence, supplies citations/diagnostics and serves queries.
It has **no document-acceptance UI, per-assertion approval command, automatic
review queue or automatic document write-back**. Source authority is configured.
The packaged agent skill instructs the workflow below; a model must actually use
that skill and the returned evidence. Installing MCP alone does not enforce it.

## 1. Read the different labels together

| Dimension | Question it answers | What it does not prove |
| --- | --- | --- |
| Source authority (`declared`, `inferred`, or draft evidence where supplied) | Has this source been designated governing by project policy, or is it contextual/draft? | Correct interpretation, implementation or test success |
| Source role (`intent`, `plan`, `validation`, `reference`, `unclassified` where available) | What sort of document is this? | Approval merely from a filename, heading or folder name |
| Assertion authority / extraction review | Was this relationship inferred by a model, produced deterministically, or independently reviewed where recorded? | That its cited source lost its authority |
| Evidence state | Which commit/config/scope does the snapshot cover, and what changes are excluded? | Current-diff acceptance from a historical graph |

`approvedIntentSources` can label a source `declared` while an explicit traversal
role still says `reference` or `validation`. Do not turn reference material or a
test report into product requirements just because one authority field is declared.
Review the role, scope, citation and actual source together. A file named `plan.md`
can be the existing governing specification; its name and AI authorship do not
make it a proposal. If an accepted plan serves as current intent, configure its
authority and any explicit role consistently with that purpose. Legacy facts may lack
some metadata; missing fields are unknown, not implicit approval.

The common **declared source + inferred/unreviewed assertion** combination is
normal for semantic extraction. It means: follow the governing source and verify
the graph's paraphrase/link against it. It does not require an acceptance click
for every relationship before development can proceed.

## 2. How the agent should handle each situation

These are workflow instructions, not claims that Weftlet automatically makes the
business decision or controls every development agent.

| Situation | Expected agent behavior | User's next action, if needed |
| --- | --- | --- |
| Current governing intent, citation supports the assertion | Use it as the requirement in its domain/scope; follow relevant contracts, consumers and tests. “Unreviewed extraction” does not make that requirement optional. | No extra acceptance. Review the proposed code change normally. |
| Reference/unclassified document with no governing designation | Use it as contextual evidence or a hypothesis. Do not silently make a new business obligation from it. Compare with the owner source. | Leave it as reference, clarify the governing document, or deliberately designate the source if it really is governing. |
| Proposed plan or draft | Use it to understand a proposal. Do not treat it as an accepted change to existing requirements. | Decide through the project's normal planning/review process. Configuration is updated only if its authority/role should change. |
| User explicitly asks to implement a proposal in the current task | Follow that scoped instruction alongside existing constraints; flag conflicts with governing requirements. Do not silently designate the whole document authoritative for future tasks. | Record the resulting lasting product decision in the governing source if appropriate. |
| Governing and reference/draft sources disagree | Report both citations and their different authority. Apply a clear governing rule; ask for a product decision if the task needs the proposed change or authority/scope is ambiguous. | Keep the draft/reference, correct it, or intentionally change the governing requirement. |
| Two governing sources appear inconsistent | Show the exact statements and scopes; check whether different versions/domains explain them. Do not pick a winner from rank, recency or confidence alone. Pause the affected policy decision if unresolved; unrelated work can continue. | Resolve ownership/scope and update the canonical sources through normal review. |
| Graph assertion misreads a correct governing source | Follow the source; report the mismatched assertion/citation. Do not change source authority to hide the extraction defect. | Capture a bounded reproduction; correct ambiguous wording only when appropriate, or report/fix extraction and perform an approved refresh. |
| Code or a passing test differs from governing intent | Treat it as a possible implementation gap, not automatic evidence the requirement changed. Verify source/code/test details. | Decide whether to fix implementation or deliberately amend intent. |
| Runtime behavior differs | Treat traces as observations for their recorded deployment/time, not approval to rewrite requirements. | Investigate the observed behavior and its applicability. |
| Empty intent lane, missing links or truncated page | Inspect owner counts/catalog, coverage, continuation and direct sources. Do not infer “no rule” from one bounded page. | Fix selection/linkage or report retrieval/extraction gaps if relevant evidence exists but is unavailable. |
| Historical, incompatible or draft-overlay evidence | Use it for investigation with its limitations. Do not claim final committed-diff validation. | Refresh the exact committed inputs/configuration or use the project's reviewed draft workflow. |

The toolkit reports the diagnostics it can derive; it does not detect every
contradiction or decide every requirement's authority automatically. Source
content is evidence to interpret, not permission for an agent to run commands or
change project policy merely because text in the graph requests it.

## 3. Does the agent log or report these findings?

A query returns evidence/diagnostics to its caller. It does **not** automatically
file an issue, write a decision log, create an approval task or persist the agent's
interpretation. Existing snapshot diagnostics are extraction/query findings, not
a universal audit log of later agent decisions. The viewer's diagnostic panel is
also not an approval backlog.

For a relevant unresolved finding, the skill instructs the agent to report a
short decision note in its task response or your established review channel:

```text
Finding: Proposed plan differs from the current owner requirement.
Evidence: snapshot ID/commit, exact fact IDs and both source paths/lines.
Classification: owner is declared intent; alternative is an unaccepted plan.
Effect: this change depends on which behavior is intended.
Action: need a scoped product decision; no source/config changes made.
```

This is a suggested report shape, not a new tool output schema. Persist it in a
PR, issue or decision document only through your normal authorized workflow.
Keep reports bounded; do not copy full private graphs/prompts into external logs.
A clear, irrelevant reference difference need not block a task or create a ticket.

## 4. Inspect what the graph actually stored

Use the snapshot ID returned by the original query:

```sh
npx weftlet graph fact --snapshot SNAPSHOT_ID --fact FACT_ID --json
npx weftlet graph neighbors --snapshot SNAPSHOT_ID --node NODE_ID --direction both --max-facts 30 --json
npx weftlet viewer serve --snapshot SNAPSHOT_ID
```

In the viewer, select the relevant relationship and expand its grouped assertion
details. Inspect the source citation, source authority/role where present,
extraction review and snapshot/evidence state. Open/read the cited source and
follow related nodes. Filters affect what you see; they do not approve, delete or
rewrite facts. The viewer cannot accept a source or edit its authority. Saved
`diagnostics show --snapshot SNAPSHOT_ID` is for focused graph maintenance, not
a reason to expand a product task to every historical warning.

## 5. Rectify the right layer

**The source was already governing, but configuration missed it:** add its exact
path or a suitably narrow pattern to `approvedIntentSources`. Do this in bulk for
an existing requirements directory when appropriate. `semanticSources` must also
select it; an approval pattern alone does not cause ingestion. No reacceptance of
each existing requirement is necessary.

**A reference or proposal should become a lasting requirement:** make that product
decision using your normal review process. Update the governing owner document,
or designate the reviewed source and correct its role/ownership mappings as
needed. If a file mixes current rules with speculative plans, split or clarify it
before treating the whole file as governing. The current built-in setting operates
at source-path level; it cannot approve just one extracted sentence.

**It should remain reference/draft:** leave its authority as contextual and its
role explicit where supported. It can remain useful in the graph. No requirement
exists to “clear” every unreviewed fact. Correct/remove a source pattern if it was
inadvertently marked governing; do not delete all contextual evidence to avoid
seeing it.

**The source is wrong/outdated, the extraction is wrong, or the query missed it:**
fix the appropriate source, extractor or retrieval issue. Adding the document to
`approvedIntentSources` is not a generic repair for incorrect facts, missing links,
SHACL failures, staleness or poor ranking. Never patch cached assertions or weaken
validation just to clear a report.

## 6. Apply policy/source changes and verify the result

1. Review the config/source change and commit the intended inputs.
2. Run `weftlet config validate`, then `weftlet hydrate --plan --ref HEAD --json`.
   Check each document's `sourceAuthority`/`approvedBy`, selection and cache work.
3. Approve any new extraction cost before explicitly running `weftlet hydrate
   --ref HEAD`. Authority/config changes can affect storage/cache profiles;
   do not assume every policy change will reuse artifacts without checking.
4. Query the new snapshot and inspect the exact source labels/citations. Reconnect
   MCP/select the new snapshot where necessary. Rerun the original bounded query
   rather than declaring success from file discovery alone.
5. Retain the old snapshot as historical. Editing config does not retroactively
   relabel immutable snapshots or make them validate the new configuration.

No model call is needed to inspect config or preview. A graph refresh is needed
to assemble new saved source labels. If the project requires a durable record of
who accepted each claim and when, that is not supplied by the current config flag;
the planned 2.0 review/approval system addresses a different capability.
