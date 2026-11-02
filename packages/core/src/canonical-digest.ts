import { createHash } from 'node:crypto';

/**
 * SHA-256 of the exact legacy stableJson encoding, without a graph-sized string.
 * This deliberately retains legacy handling of undefined (including array holes)
 * and ignores toJSON, just as stableJson does. It is not a new JSON canonicalization.
 */
export function stableJsonDigest(value: unknown): string {
  return digest(value, false);
}

/** SHA-256 of stableJson(JSON.parse(JSON.stringify(value))), without whole-value copies. */
export function persistedJsonDigest(value: unknown): string {
  return digest(value, true);
}

function digest(value: unknown, persisted: boolean): string {
  const hash = createHash('sha256');
  let buffer = '';
  const write = (text: string) => {
    buffer += text;
    if (buffer.length >= 64 * 1024) {
      hash.update(buffer);
      buffer = '';
    }
  };
  const string = (text: string) => {
    // Split before escaping, retaining paired surrogates in the same chunk.
    // JSON.stringify escapes lone surrogates; UTF-8 hashing therefore stays exact.
    write('"');
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 16 * 1024, text.length);
      if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
      write(JSON.stringify(text.slice(start, end)).slice(1, -1));
      start = end;
    }
    write('"');
  };
  const prepare = (item: unknown, key: string): unknown => {
    if (!persisted) return item;
    if (item !== null && (typeof item === 'object' || typeof item === 'bigint')) {
      const toJSON = (item as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === 'function') item = toJSON.call(item, key);
    }
    if (item instanceof Number || item instanceof String || item instanceof Boolean) return item.valueOf();
    if (item instanceof BigInt) return item.valueOf();
    return item;
  };
  const omitted = (item: unknown) => item === undefined || typeof item === 'function' || typeof item === 'symbol';
  const active = new Set<object>();
  const visit = (item: unknown, context: 'root' | 'array' | 'object') => {
    if (item !== null && typeof item === 'object') {
      if (active.has(item)) throw new TypeError('Cannot hash circular JSON');
      active.add(item);
    }
    if (Array.isArray(item)) {
      write('[');
      for (let index = 0; index < item.length; index++) {
        if (index) write(',');
        visit(prepare(item[index], String(index)), 'array');
      }
      write(']');
    } else if (item !== null && typeof item === 'object') {
      write('{');
      let first = true;
      for (const key of Object.keys(item).sort()) {
        const child = prepare((item as Record<string, unknown>)[key], key);
        if (persisted && omitted(child)) continue;
        if (!first) write(',');
        first = false;
        string(key);
        write(':');
        visit(child, 'object');
      }
      write('}');
    } else if (typeof item === 'string') {
      string(item);
    } else {
      const encoded = JSON.stringify(item);
      if (encoded !== undefined) write(encoded);
      else if (persisted && context === 'array') write('null');
      else if (context === 'object') write('undefined');
      else if (context === 'root') throw new TypeError('Cannot hash an undefined stableJson encoding');
    }
    if (item !== null && typeof item === 'object') active.delete(item);
  };
  visit(prepare(value, ''), 'root');
  hash.update(buffer);
  return hash.digest('hex');
}
