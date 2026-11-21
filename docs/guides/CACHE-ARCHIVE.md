# Move a user cache or recover a historical graph

For a fresh user cache, set `WEFTLET_USER_CACHE_ROOT` to an absolute, dedicated directory before starting Weftlet. Set it for the CLI, the MCP launcher and each CI job that uses the cache. The default is `~/.cache/context-graph`. With the same checkout path and configuration, the snapshot and semantic profile names are identical on the new volume. Changing the checkout path can change the profile. A project using `storageScope: "workspace"` selects its own `storagePath` instead.

## Preview and archive

Start from a [coordinated cache](CACHE-COORDINATION.md) and its [retention policy](CACHE-RETENTION.md). Declare the profiles and bookmarks you want to preserve. Keep the policy and the review output outside both the cache and the archive. Supply the producing project configuration for each shared semantic partition. Run the example from the project checkout.

```sh
weftlet cache archive plan --root /cache/live --policy /reviews/policy.json \
  --config ./context-graph.config.json --include-cold-semantic > /reviews/archive-plan.json

weftlet cache archive create --root /cache/live --policy /reviews/policy.json \
  --config ./context-graph.config.json --include-cold-semantic \
  --output /private-backups/release-1 --expect-plan REVIEWED_PLAN_ID
```

Review the plan's generations, file sizes, SHA-256 values, pins, omitted categories and total payload. Use the exact `planId` for later commands and keep it separately from the bundle. Each selected generation lists whether a raw index or shared index was found. The archive includes the original encoded snapshots, current and previous head records, available companion indexes, required semantic artifacts and stored comparison receipts and mapping proposals. Use `--include-cold-semantic` for additional reusable artifacts within the selected profiles. Repeat `--config` for additional producing configurations. A missing required artifact stops creation. For a large cache, pass the same `--max-entries` and `--max-bytes` (per file) on plan, create and cutover. An incomplete inventory stops the operation.

Choose a private encrypted destination with access controls. The directory can contain citations, raw semantic outputs, source identifiers and historical evidence. For a remote destination, use your authenticated backup transport to copy the directory and restore from the received copy. Keep the plan ID in your backup inventory. Creation stages the bytes, checks SHA-256 on readback and requires a free-space reserve. It leaves the live cache available after the operation.

## Verify recovery and choose a cutover

```sh
weftlet cache archive restore --input /private-backups/release-1 \
  --to /new-volume/graph-cache --expect-plan REVIEWED_PLAN_ID
```

Restore works without the producing checkout or a model. It requires a new destination and checks payload digests, saved graph structure, head references and a bounded historical query before publishing the directory. The restored cache gets a fresh coordination identity. Keep the original policy and receipt with the backup. Physical compiler declarations, source coordination journals and their filesystem identities belong to the original cache.

For a whole-cache move, stop every CLI, MCP and CI writer, complete any outstanding maintenance, then verify both roots together:

```sh
weftlet cache archive cutover --root /cache/live --to /new-volume/graph-cache \
  --policy /reviews/policy.json --config ./context-graph.config.json \
  --include-cold-semantic --expect-plan REVIEWED_PLAN_ID --acknowledge-quiescence
```

Cutover requires a user-scoped configuration for the active routes and checks the current source plan against the restored generations and exact files. An omitted historical graph, detached shared index, unresolved ownership record or unrelated durable file stops whole-cache cutover. A scoped archive can still be useful for individual historical reads. Review any source-only operational audit history separately. Restart your clients with the returned environment setting. Rebind scheduled maintenance to the new root identity after reviewing its policy. The old root stays available for rollback. Eviction is a separate reviewed retention operation.

After interruption, a destination-specific `.weftlet-transfer-*.lock` directory can contain an owner record and partial staging bytes. Confirm the writer has stopped, follow [offline recovery](CACHE-RECOVERY.md) for any interrupted managed cache, and retry with a new destination. The last published cache remains usable. A completed archive proves retrieval of historical evidence at its saved identity. Current-diff acceptance still uses the producing commit and validation settings.
