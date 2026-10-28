// Experimental benchmark worker only. Not part of the published runtime or a supported execution option.
import { parentPort, workerData } from 'node:worker_threads';
import { measure } from './measure.mjs';
parentPort.postMessage({ kind: 'ready' });
parentPort.on('message', async ({ snapshot, scenario }) => {
  try {
    if (workerData?.cancelProbe) {
      const { RdfEvidenceGraph } = await import('../../dist/graph/rdf.js');
      const graph = new RdfEvidenceGraph(snapshot);
      await graph.validate({ onProgress: event => parentPort.postMessage({ kind: 'phase', event }) });
      parentPort.postMessage({ kind: 'unexpected-verdict' });
    } else parentPort.postMessage({ kind: 'result', result: await measure(snapshot, scenario) });
  } catch (error) { parentPort.postMessage({ kind: 'error', message: String(error) }); }
});
