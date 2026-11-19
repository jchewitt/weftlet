export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const exactKeys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(',') === [...expected].sort().join(',');
export const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
