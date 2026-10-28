# ADR 028: bounded physical artifact names

Status: implemented; release status is recorded in [validation](VALIDATION.md).

The consumer reported that long physical artifact/temp names block the traversal → unchanged
repeat → clean-comparison sequence on Windows. A public regression using traversal, routing and
an empty runtime-evidence revision reproduces `ENAMETOOLONG` in real SCIP during clean comparison
on Linux too. Appending `.scip.<UUID>.tmp` to the complete logical identity exceeds the common
255-byte filename-component limit. RDF and optional OML work directories also embedded the entire
identity. This is a physical storage defect, not a graph identity, business-rule or SHACL defect.

## Physical names and compatibility

Keep portable literal artifact keys of at most 128 ASCII characters. Longer/nonportable keys
use `~` followed by the full SHA-256 of the logical key. The `~` namespace is excluded from
literal logical storage identifiers, preventing a hash from aliasing a user-supplied short key.
Windows device names are also hashed. Existing logical identifier validation and its 256-character
limit remain intact; no snapshot, fact, provenance, extractor or cache identity is shortened.

Snapshot JSON, heads, semantic cache storage and SCIP output use this mapping. Generated semantic
cache keys are already 64-character digests and retain their names. Snapshot reads fall back to
the old literal filename if the bounded path is absent. Semantic reads retain explicit legacy
root handling. Skip legacy components that cannot exist within the filename limit (and Windows
device names on Windows), but propagate other I/O and corrupt-JSON errors.

Existing legacy immutable snapshots/artifacts are checked before publication and retained byte
for byte. A different content/output digest for the same identity remains an error. Updating a
long legacy head writes the new bounded head and gives it precedence without modifying history.
No bulk cache migration, forced extraction or automatic deletion is required. Older toolkit
versions cannot necessarily read newly hashed long-name entries; use supported store/CLI queries
with the full logical ID rather than constructing a filename from it.

Staging names are independent UUIDs in the destination directory, preserving same-filesystem
atomic link/rename publication. Cross-process immutable winner and head replacement semantics
remain unchanged. SCIP staging files are cleaned after success or failure. RDF/optional OML work
directories need only a backend prefix and UUID; RDF output digests do not depend on their names.
The optional OML generated document filenames remain their existing semantic digest keys.

This bounds toolkit-generated components; it does not promise that arbitrary storage-root lengths
or user source filenames work with every external program's total-path restrictions. The original
working checkout is not moved or cleaned. Full logical IDs remain in snapshots, head records,
facts and query responses, and saved evidence remains queryable without providers.

## Validation boundary

The public sequence uses the unchanged Codex adapter with its offline grammar runner, real SCIP,
RDF/SHACL, document traversal, configured routing and an injected empty runtime provider. First
hydration extracts six semantic documents; repeat and clean comparison reuse all six. The clean
identity retains traversal/clean/runtime suffixes and exceeds 215 characters. Content digests and
all facts/provenance except the containing snapshot ID agree; the original head stays unchanged.
Generated components are bounded and no staging files remain. The exact sequence is part of the
existing native Windows traversal suite as well as the Linux suite.

Storage regressions cover 256-character snapshot/artifact/head keys, concurrent immutable writes,
concurrent head replacement, legacy reads without rewriting bytes, legacy cache roots, collisions
and unsafe input rejection. Existing cross-process publication tests remain required. Live provider
calls, private TradePilot acceptance and live openCAESAR compilation are separate; this patch does
not claim them or change validation constraints, graph semantics or evidence authority.
