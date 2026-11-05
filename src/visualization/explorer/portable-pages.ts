const version = 'focused-report-page-v1';
function encode(value: unknown): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
/** Portable cursors are report-specific; local-service cursors are deliberately not interchangeable. */
export function portablePage(token: string | undefined, binding: unknown, length: number, size: number) {
  const key = JSON.stringify(binding);
  let offset = 0;
  if (token !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      const decoded = atob(token.replaceAll('-', '+').replaceAll('_', '/'));
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(decoded, char => char.charCodeAt(0))));
      if (!value || Object.keys(value).sort().join(',') !== 'binding,offset,version' || value.version !== version ||
        value.binding !== key || !Number.isSafeInteger(value.offset) || value.offset < 1 || value.offset >= length || value.offset % size !== 0) throw new Error();
      offset = value.offset;
    } catch { throw new Error('Portable continuation does not match this report/query; restart the query'); }
  }
  const end = Math.min(length, offset + size);
  return { offset, end, ...(end < length ? { continuation: encode({ version, binding: key, offset: end }) } : {}) };
}

/** A shard's physical name is its exact SHA-256, not a logical graph ID. */
export async function fetchReportJson(path: string): Promise<unknown> {
  const match = /^data\/([a-f0-9]{64})\.json$/.exec(path);
  if (!match) throw new Error('Invalid portable data path');
  if (!globalThis.crypto?.subtle) throw new Error('Serve the portable report over HTTPS or localhost HTTP for integrity checks');
  const response = await fetch(`./${path}`);
  if (!response.ok || !response.body) throw new Error('A portable data file is unavailable');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 8 * 1024 * 1024) throw new Error('Portable data file exceeds its size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== match[1]) throw new Error('Portable data integrity check failed; restore or re-export the report');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
