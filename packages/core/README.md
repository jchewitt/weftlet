<!-- Modified for standalone extraction; see docs/extraction-manifest.json. -->
# `@weftlet/core`

Graph records, provider and adapter contracts, and deterministic keying utilities for
[Weftlet](https://github.com/jchewitt/weftlet), an evidence-backed context-graph toolkit for
AI development agents.

The core package has no runtime dependencies. Install `@weftlet/toolkit` for the CLI,
MCP server, extraction, storage and graph queries.

Repository adapters should construct physical-file nodes with the public factory:

```ts
import { repositoryFileNode } from '@weftlet/core';

const file = repositoryFileNode('src/worker.spec.ts');
// { id: 'component:file:src/worker.spec.ts', label: 'src/worker.spec.ts', kind: 'Evidence' }
```

Markdown/MDX/text documents use `document:<path>` and `Document`; `.spec.<extension>` and
`.test.<extension>` files use `component:file:<path>` and `Evidence`; other files use that
file prefix and `Component`. Extension matching ignores case, while path spelling is retained.
Supply a repository-relative path using the repository's canonical spelling. This pure mapping
does not resolve paths, read files, detect every testing convention or approve product intent.
Keep business-concept identities separate. Adapters can add attributes without changing the
factory's `id` or `kind`; use the same node for mocked/DI/decorator-bearing tests and production
sources. This API is available starting with 0.4.0; it is absent from 0.3.0.

Licensed under Apache-2.0; see LICENSE and NOTICE for attribution.
