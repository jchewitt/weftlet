import { corpusLifecycle } from './lifecycle.js';

const modules = Number(process.argv[2] ?? 200), functions = Number(process.argv[3] ?? 40);
if (![modules, functions].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2000)) {
  throw Error('Usage: tsx scripts/large-graph/run.ts [modules=200] [functions=40] [--require-large]');
}
const started = performance.now();
const report = await corpusLifecycle(modules, functions, process.argv.includes('--require-large'),
  event => console.log(JSON.stringify({ totalElapsedMs: Math.round(performance.now() - started), ...event as object })));
console.log(JSON.stringify({ status: 'passed', elapsedMs: Math.round(performance.now() - started), ...report }));
