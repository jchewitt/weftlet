import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
const load = path => import(pathToFileURL(join(spec.baseline, path)).href);
const { ScipTypeScriptIndexer } = await load('dist/extraction/static.js');
const { createContextGraphApplication } = await load('dist/application/application.js');
let indexed;
const phases = [];
const original = ScipTypeScriptIndexer.prototype.index;
ScipTypeScriptIndexer.prototype.index = async function(context) {
  const started = performance.now();
  indexed = await original.call(this, context);
  phases.push({ phase: 'index', seconds: (performance.now() - started) / 1000 });
  return indexed;
};
await mkdir(spec.output, { recursive: true });
const app = await createContextGraphApplication(join(spec.consumerRoot, 'context-graph.config.json'));
const started = performance.now();
const result = await app.hydrator.hydrate({ ref: spec.commit, headName: 'default' });
phases.push({ phase: 'baseline-hydration', seconds: (performance.now() - started) / 1000 });
if (!indexed) throw new Error('Expected a recorded real SCIP index; do not fabricate an unmeasured index');
const require = createRequire(join(spec.baseline, 'package.json'));
const runtime = require(join(dirname(require.resolve('@sourcegraph/scip-typescript')), 'scip.js'));
const bytes = await readFile(indexed.path);
await writeFile(join(spec.output, 'index.scip'), bytes);
await writeFile(join(spec.output, 'scip.raw.json'), JSON.stringify(runtime.scip.Index.deserializeBinary(bytes).toObject()) + '\n');
await writeFile(join(spec.output, 'baseline.snapshot.json'), JSON.stringify(result.snapshot) + '\n');
await writeFile(join(spec.output, 'scip.phases.json'), JSON.stringify({ phases, index: indexed,
  semanticExtracted: result.semanticExtracted, semanticReused: result.semanticReused,
  excludedWorkingChanges: spec.excludedWorkingChanges }) + '\n');
