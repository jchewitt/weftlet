import { execFileSync } from 'node:child_process';

/** Decode Git's length-delimited blobs without treating source bytes as line-oriented text. */
export function decodeCommittedInputs(bytes, objectIds) {
  const result = new Map();
  let offset = 0;
  for (const expected of objectIds) {
    const end = bytes.indexOf(10, offset);
    if (end < 0) throw new Error('Incomplete Git batch header');
    const match = /^([a-f0-9]{40}|[a-f0-9]{64}) blob ([0-9]+)$/.exec(bytes.toString('ascii', offset, end));
    const size = Number(match?.[2]);
    if (match?.[1] !== expected || !Number.isSafeInteger(size) || size > 1024 * 1024) {
      throw new Error('Invalid or oversized committed input in Git batch');
    }
    offset = end + 1;
    if (offset + size >= bytes.length || bytes[offset + size] !== 10) throw new Error('Incomplete Git batch blob');
    result.set(expected, bytes.subarray(offset, offset + size));
    offset += size + 1;
  }
  if (offset !== bytes.length) throw new Error('Unexpected trailing Git batch output');
  return result;
}

/** Read only inventoried regular blobs from the already-resolved immutable tree. */
export function readCommittedInputs(root, entries, paths) {
  const selected = paths.map(path => {
    const entry = entries.get(path);
    if (!entry) throw Object.assign(new Error(`Missing committed input: ${path}`), { code: 'ENOENT' });
    const match = /^100(?:644|755) blob ([a-f0-9]{40}|[a-f0-9]{64})$/.exec(entry);
    if (!match) throw new Error(`Input is not a regular blob: ${path}`);
    return [path, match[1]];
  });
  const ids = [...new Set(selected.map(([, id]) => id))];
  if (!ids.length) return new Map();
  const bytes = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root, input: ids.join('\n') + '\n', maxBuffer: 4 * 1024 * 1024,
  });
  const blobs = decodeCommittedInputs(bytes, ids);
  return new Map(selected.map(([path, id]) => [path, blobs.get(id)]));
}
