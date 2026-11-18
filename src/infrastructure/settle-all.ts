/** Keep operation-owned resources protected until every started task settles, including after failure. */
export async function settleAll<T>(operations: readonly Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length === 1) throw failures[0]!.reason;
  if (failures.length > 1) throw new AggregateError(failures.map(result => result.reason), 'Multiple concurrent operations failed');
  return results.map(result => (result as PromiseFulfilledResult<T>).value);
}
