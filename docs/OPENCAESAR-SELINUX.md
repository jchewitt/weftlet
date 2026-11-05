# Optional openCAESAR compiler: SELinux compatibility

This is the same 0.7.4 consumer compiler compatibility ticket. The canonical owner is
`OpenCaesarOntologyCompiler.compile` in `src/extraction/ontology.ts`, shipped as
`@weftlet/toolkit/dist/extraction/ontology.js`. RDF remains the default backend; this fix
does not make Docker or openCAESAR mandatory or change semantic/cache identities or SHACL.

## Boundary and correction

The consumer reported that vanilla 0.7.4 mounted its unique copied `work/ontology-UUID`
directory without an SELinux label. Enforcing Fedora audit evidence correlated Java
`container_t` write denials against that copy, labeled `bin_t`, with Gradle native-service
initialization failure after Codex extraction passed.

On Linux, immediately after copying the ontology and before generated-source writes or
mounting, the compiler now requires `lstat(work).isDirectory()`. A copied root symlink is
rejected without following it. The existing Docker path conversion is retained; only the
disposable copy is mounted with Docker's private `:Z` label option. Repository, source and
cache roots are never the relabel target. See the
[Docker bind-mount documentation](https://docs.docker.com/engine/storage/bind-mounts/#configure-the-selinux-label).

Non-root UID/GID arguments, `GRADLE_USER_HOME`, configured pinned image, Gradle tasks,
unique workspace isolation and existing work retention are unchanged. Windows/macOS mount
arguments and the preceding Docker availability probe are unchanged. There is no privileged mode, label disablement, chmod workaround,
cache deletion or broad relabel. The new guard is scoped to the copied root; it does not
claim general sandboxing of arbitrary ontology projects or their build scripts.

## Evidence and validation limits

- **Upstream deterministic regression:** `tests/ontology-compiler.test.ts` uses actual
  temporary copies and a mocked process boundary. Six cases cover Linux/Darwin/Windows
  arguments, concurrent same-ID compilations, failure propagation, source/snapshot byte
  preservation and copied-root symlink rejection before generated writes or container execution.
  Native Windows skips the symlink case because its copy restriction does not exercise the
  Linux guard. Simulated platforms do not establish native host or SELinux compatibility.
- **Consumer-reported checks:** 43 checks passed; Ubuntu ran all six consumer compiler
  regressions, including the symlink case. These are reports for the consumer's tracked pnpm
  patch, whose SHA-256 is
  `740fcd24dca65cc1b5dd67c8b22122d244dd1c761d9f7416e62eaa3023de46fb`.
- **Real enforcing-host recovery, November 4 Central / November 5 UTC:** patched consumer
  commit `0e10ec89d0fffee557d38eb8a09823c204736e17` passed public generic hydration,
  real openCAESAR compilation, strict SHACL in **173 ms**, and exact-commit snapshot
  publication of **41 facts / 26 nodes**. Read-only `getenforce` remained `Enforcing`.
  This is bounded patched-consumer evidence, not acceptance of an unpatched upstream release
  or the whole private viewer. The private source and logs are not imported here.
- **Separate operational timeout:** the next private semantic extraction stopped after
  120079 ms at its configured 120000-ms limit, before private ontology compilation. No private
  viewer artifact was produced. The logs do not establish a 429 or capacity error. There is
  no authorization to increase the limit or retry that workload as part of this fix.
- **Cloud executor outage:** this development workspace was unavailable independently of the
  compiler defect. Shell access recovered November 5; that does not validate enforcing SELinux.

The opt-in public test below uses real Docker, the existing pinned image and public ontology.
It requires `/sys/fs/selinux/enforce` to be `1` before and after compilation, a local Unix-socket
Docker endpoint and `name=selinux` in the daemon's security options. Remote Docker endpoints
are rejected because this host's enforcement flag cannot establish the remote host's policy.
Run directly on the enforcing host, with its local daemon; do not forward a remote daemon
through a local socket. It makes no model/provider requests. Run it on an
enforcing Linux host with the repository's Node/pnpm prerequisites and Docker permissions:

```sh
WEFTLET_SELINUX_INTEGRATION=1 pnpm exec vitest run tests/ontology-selinux.integration.test.ts
```

The normal suite skips this test explicitly. Upstream execution on an enforcing host remains
deferred until recorded; the existing consumer recovery is not substituted for that result.

## Release and consumer closeout

Follow the existing independently reviewed Changesets and trusted-publishing gates. Record
the release commit, matching toolkit/core versions and actual archive SHA-512 values in the
release evidence. Publication alone does not close consumer acceptance.

The separately owned consumer will upgrade normally, remove its exact-version patch and
registration, regenerate the lockfile, and verify frozen installs without `allowUnusedPatches`.
Its partial Docker build contexts must stop depending on the removed patch through normal
consumer changes. Retain/adapt the compiler regressions and run the bounded exact-commit graph
and protected Fedora viewer path under unchanged budgets. Record actual upstream artifacts
and consumer results before closing the temporary-patch follow-up. Upstream does not edit the
consumer checkout or run private extraction/viewer workloads.
