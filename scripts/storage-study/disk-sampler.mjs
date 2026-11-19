import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

// Run outside the hydration thread so synchronous indexing/validation cannot stop sampling.
const { cache, scratch, intervalMs } = workerData;
function sample() {
  const bytes = { snapshots: 0, scip: 0, otherCache: 0, work: 0, staging: 0, scratch: 0 };
  let allocatedBytes = 0;
  const seen = new Set();
  function visit(path, relative, temporary) {
    try {
      const stat = lstatSync(path, { bigint: true });
      if (stat.isDirectory()) {
        for (const entry of readdirSync(path)) visit(join(path, entry), relative ? relative + '/' + entry : entry, temporary);
      } else if (stat.isFile()) {
        const identity = stat.dev + ':' + stat.ino;
        if (seen.has(identity)) return;
        seen.add(identity);
        allocatedBytes += Number(stat.blocks) * 512;
        let group = 'otherCache';
        if (temporary) group = 'scratch';
        else if (relative.startsWith('work/')) group = 'work';
        else if (relative.endsWith('.tmp')) group = 'staging';
        else if (relative.startsWith('scip/')) group = 'scip';
        else if (relative.startsWith('snapshots/')) group = 'snapshots';
        bytes[group] += Number(stat.size);
      }
    } catch (error) {
      // Renames, publication and workspace disposal can race a directory scan.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  visit(cache, '', false);
  visit(scratch, '', true);
  return { bytes, allocatedBytes, total: Object.values(bytes).reduce((a, b) => a + b, 0),
    working: bytes.work + bytes.staging + bytes.scratch };
}
const before = sample();
let samples = 1, peak = before, maxWorking = before.working, maxScratch = before.bytes.scratch, maxAllocated = before.allocatedBytes;
function capture() {
  const current = sample();
  samples++;
  maxAllocated = Math.max(maxAllocated, current.allocatedBytes);
  if (current.total > peak.total) peak = current;
  maxWorking = Math.max(maxWorking, current.working);
  maxScratch = Math.max(maxScratch, current.bytes.scratch);
  return current;
}
const timer = setInterval(capture, intervalMs);
parentPort.postMessage('ready');
parentPort.once('message', () => {
  clearInterval(timer);
  const after = capture();
  parentPort.postMessage({ before, peak, after, maxWorking, maxScratch, maxAllocated, samples });
  parentPort.close();
});
