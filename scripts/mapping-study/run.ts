import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assessMappings, evaluatorIdentity } from './assessment.js';

const { values } = parseArgs({ options: { output: { type: 'string',
  default: '.context-graph/evaluation/mapping-gaps/report.json' } }, allowPositionals: false, strict: true });
const root = fileURLToPath(new URL('../../', import.meta.url));
const evaluator = await evaluatorIdentity(root);
const report = { evaluator, ...await assessMappings(join(root, 'evaluations/mapping-gaps'),
  phase => process.stderr.write(`[mapping-study] ${phase}\n`)) };
const output = resolve(values.output!);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ output, passed: report.passed, ...report.summary }) + '\n');
if (!report.passed) process.exitCode = 1;
