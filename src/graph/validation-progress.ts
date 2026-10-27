export type GraphValidationPhase = 'validate-identities' | 'build-rdf-evidence' |
  'build-validation-union' | 'validate-shacl';

export interface GraphValidationProgress {
  readonly phase: GraphValidationPhase;
  readonly status: 'started' | 'completed' | 'failed';
  /** Wall time for this phase, not a completion estimate or in-phase heartbeat. */
  readonly elapsedMs: number;
  readonly factCount: number;
  readonly nodeCount?: number;
}

/** Phase boundaries remain observable even when an operation blocks same-thread timers. */
export async function measureValidationPhase<T>(
  phase: GraphValidationPhase,
  counts: { readonly factCount: number; readonly nodeCount?: number },
  onProgress: ((event: GraphValidationProgress) => void) | undefined,
  operation: () => T | Promise<T>,
): Promise<T> {
  const started = performance.now();
  const emit = (status: GraphValidationProgress['status']) => onProgress?.({
    phase, status, ...counts, elapsedMs: Math.max(0, Math.round(performance.now() - started)),
  });
  emit('started');
  let result: T;
  try { result = await operation(); }
  catch (error) { emit('failed'); throw error; }
  emit('completed');
  return result;
}
