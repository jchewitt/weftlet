import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../src/visualization/explorer/', import.meta.url);
const destination = new URL('../dist/visualization/explorer-assets/', import.meta.url);
await mkdir(destination, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('app.ts', source))], outfile: fileURLToPath(new URL('app.js', destination)),
  bundle: true, minify: true, target: 'es2022', platform: 'browser', format: 'iife', legalComments: 'linked' });
await cp(new URL('index.html', source), new URL('index.html', destination));
await cp(new URL('style.css', source), new URL('style.css', destination));
await cp(new URL('../LICENSE', import.meta.resolve('cytoscape')), new URL('CYTOSCAPE-LICENSE.txt', destination));
