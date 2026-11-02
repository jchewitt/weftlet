import type { MappingProposalRequest } from '@weftlet/core';

export const mappingVersion = 'mapping-proposal-v1' as const;
export function parseMappingRequest(value: unknown): Required<MappingProposalRequest> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Mapping request must be an object');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['snapshotId', 'ruleId', 'documentPath', 'files', 'maxCandidates', 'maxInputBytes'].includes(key))) throw Error('Unknown mapping request field');
  const text = (value: unknown, max: number): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Invalid mapping request string');
    return value;
  };
  const path = (value: unknown) => {
    const s = text(value, 8192);
    if (/[:\\\x00-\x1f\x7f]/.test(s) || s.split('/').some(part => !part || ['.', '..', '.git'].includes(part))) throw Error('Mapping paths must be repository relative regular source paths');
    return s;
  };
  const limit = (key: string, fallback: number, max: number) => {
    const n = item[key] === undefined ? fallback : item[key];
    if (!Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > max) throw Error(`Invalid ${key}; maximum ${max}`);
    return Number(n);
  };
  if (!Array.isArray(item.files) || !item.files.length || item.files.length > 4) throw Error('Select between one and four mapping files');
  const files = item.files.map(path).sort();
  if (new Set(files).size !== files.length) throw Error('Duplicate mapping file');
  return { snapshotId: text(item.snapshotId, 256), ruleId: text(item.ruleId, 8192), documentPath: path(item.documentPath), files,
    maxCandidates: limit('maxCandidates', 8, 20), maxInputBytes: limit('maxInputBytes', 32_768, 131_072) };
}
