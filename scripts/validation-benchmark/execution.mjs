import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

export async function observe(operation) {
  const started = performance.now();
  const timer = new Promise(resolve => setTimeout(() => resolve(performance.now() - started), 0));
  const result = await operation();
  const elapsedMs = performance.now() - started;
  return { ...result, parentRoundTripMs: elapsedMs, parentTimerDelayMs: await timer };
}

export async function workerExecutor() {
  const started = performance.now();
  const worker = new Worker(new URL('./worker.mjs', import.meta.url));
  await new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('message', message => message.kind === 'ready' ? resolve() : reject(new Error('Worker did not initialize')));
  });
  const startupMs = performance.now() - started;
  return { startupMs, close: () => worker.terminate(),
    run: (snapshot, scenario) => new Promise((resolve, reject) => {
      const onError = error => { worker.off('message', onMessage); reject(error); };
      const onMessage = message => {
        worker.off('error', onError); worker.off('message', onMessage);
        if (message.kind === 'result') resolve(message.result);
        else reject(new Error(message.message ?? 'Unexpected worker response'));
      };
      worker.once('error', onError); worker.once('message', onMessage);
      worker.postMessage({ snapshot, scenario });
    }) };
}

export async function cancellationProbe(snapshot) {
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { cancelProbe: true } });
  const started = performance.now();
  return new Promise((resolve, reject) => {
    let requestedAt, gotVerdict = false;
    const timeout = setTimeout(() => { void worker.terminate(); reject(new Error('Cancellation probe deadline exceeded')); }, 15_000);
    worker.on('error', error => { clearTimeout(timeout); reject(error); });
    worker.on('message', message => {
      if (message.kind === 'ready') worker.postMessage({ snapshot, scenario: 'cancel' });
      if (message.kind === 'unexpected-verdict') gotVerdict = true;
      if (message.kind === 'error') { clearTimeout(timeout); void worker.terminate(); reject(new Error(message.message)); }
      if (message.kind === 'phase' && message.event.phase === 'validate-shacl' && message.event.status === 'started') {
        requestedAt = performance.now(); void worker.terminate();
      }
    });
    worker.on('exit', code => {
      clearTimeout(timeout);
      if (requestedAt === undefined) return reject(new Error('Worker exited before the SHACL cancellation boundary'));
      resolve({ phase: 'validate-shacl', requested: true, exitCode: code, verdictObserved: gotVerdict,
        acceptedConformance: false, terminationMs: performance.now() - requestedAt,
        processMs: performance.now() - started, publicationAttempted: false });
    });
  });
}
