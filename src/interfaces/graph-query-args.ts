/** Shared flag grammar for exact-ID graph queries; semantic validation stays in the query layer. */
export function parseGraphQueryArgs(args: readonly string[], operation: string, flags: Readonly<Record<string, string>>) {
  const values: Record<string, unknown> = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (flag === '--json') continue;
    if (flag !== '--config' && !Object.hasOwn(flags, flag)) throw new Error(`Unknown graph ${operation} argument: ${flag}`);
    const value = args[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--config') continue;
    const key = flags[flag]!;
    if (key === 'predicates') values[key] = [...(values[key] as string[] | undefined ?? []), value];
    else {
      if (Object.hasOwn(values, key)) throw new Error(`Repeated graph ${operation} argument: ${flag}`);
      values[key] = key.startsWith('max') ? Number(value) : value;
    }
  }
  return values;
}
