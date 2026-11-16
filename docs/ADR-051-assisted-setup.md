# ADR 051: typed, opt-in assisted project setup

Status: accepted for implementation; candidate qualification recorded separately.
Date: November 16, 2026 (Central).

## Problem

Deterministic setup installs skills, MCP entries and standalone CI workflows.
Existing projects also need help selecting documents and integrating their
established layout and workflow. A general agent with repository write/tools
would make configuration, credentials and source-authority changes difficult to
bound or review.

## Decision

Add `setup assist` with an independent `weftlet-setup-plan-v1` contract. Explicit
selected Markdown/text, package manifests and workflow inputs are inspected
without a model. One subsequent opt-in request uses the configured CLI/auth:
Codex, Claude or API-based OpenCode. Reuse their isolated structured-request
infrastructure, timeout/cancellation and credential handling. A semantic module
is not implicitly a setup planner. No paid fallback or automatic retries.

The model proposes typed choices, never shell commands or arbitrary patches.
Only document-selection arrays can change in Weftlet configuration. New source
paths must be explicitly selected inputs; existing patterns may be retained.
Skill/MCP writes use packaged assets and the existing deterministic planners.
CI integration adds a deterministic no-model job to a selected workflow, retaining
existing triggers, permissions and jobs. Generation security/billing choices stay
with the explicit CI scaffolder. General workflow refactoring remains manual.

Proposals contain bounded inputs' digests, exact toolkit/config identity, typed
choices, reviewable source-array changes/generated operations, output digests
and an application ID. Raw client settings and unrelated config content are
excluded. Recreate and validate changes before applying; the shared locked writer
compares every guard before any write and rechecks each replacement. No model
request occurs during review/application. The JSON-serialized representation is
hashed so absent optional fields retain identity across process/disk boundaries.

A source-authority change requires `--accept-authority` in addition to the exact
reviewed plan ID. Existing documents may already be authoritative; preserve that
configuration unless the user explicitly accepts a proposed change. This is not
claim-level approval, inferred business-document generation or 2.0 backfill.

## Limits and consequences

24 selected files, 64 KiB each, 128 KiB serialized input and 64 KiB provider
output; the fixed prompt/schema add request overhead. No silent truncation.
Known credential patterns and sensitive input paths are rejected, but the user
still reviews selected private files before disclosure. Saved proposals are
private local files, not signed portable approval certificates. Replanning is
required after input/target/tool changes. Interrupted multi-file application is
recoverable by replanning; it is not an all-or-nothing filesystem transaction.

Existing CI additions support push/PR/manual triggers and preserve unrelated
YAML structure/comments. Alias-bearing, privileged/reusable, or conflicting jobs
require manual work. This bounded path supports useful integration without
claiming arbitrary generated YAML is safe. Explicit chosen existing scripts run
only later in CI, never during setup.

Public mocked-provider and real-filesystem/CLI tests are the deterministic gate.
Actual CLI authentication/model quality, client loading and GitHub workflow
execution remain distinct qualification records. There are no private consumer
requests or extraction/cache/snapshot changes in this milestone.
