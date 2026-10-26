---
"@weftlet/core": minor
"@weftlet/toolkit": patch
---

Export the dependency-free `repositoryFileNode` factory from core and use its existing physical-file policy across neutral, SCIP, contract, document, routing and architecture producers. Contract consumers in spec/test files now retain Evidence kind and join the neutral file records under strict SHACL; production files remain Component and documents retain canonical Document identities.

Advance deterministic extraction/assembly identities, preserve historical snapshots and semantic artifacts, label extraction-version mismatches on saved queries, and reject old versions in current validation. Validate overlays with SHACL regardless of routing configuration. Consumer adapters should adopt the public factory; this release does not modify their code or reinterpret non-document semantic assertions.
