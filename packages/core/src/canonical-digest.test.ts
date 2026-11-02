import { createHash } from 'node:crypto';
import { constants } from 'node:buffer';
import { expect, it } from 'vitest';
import { persistedJsonDigest, stableJsonDigest } from './canonical-digest.js';
import { sha256, stableJson } from './util.js';

it('retains canonical digest bytes, including legacy undefined, key order and Unicode semantics', () => {
  const values = [null, true, false, -0, NaN, Infinity, '', 'quote"\\\n\t\r\0😀\ud800\udc00\udfff',
    { z: undefined, a: [undefined, , Symbol('omit'), () => 1], '10': 10, '2': 2 },
    new Date('2026-01-01'), { toJSON: () => ({ replaced: true }), actual: 3 },
    'a'.repeat(16383) + '😀' + '\ud800' + 'x'.repeat(200_000),
    { nested: { no: false, yes: true }, numbers: [1e30, 1e-30, -0, NaN] }];
  for (const value of values) expect(stableJsonDigest(value)).toBe(sha256(stableJson(value)));
  expect(() => stableJsonDigest(undefined)).toThrow();
  expect(() => stableJsonDigest(1n)).toThrow();
  const circular: unknown[] = []; circular.push(circular);
  expect(() => stableJsonDigest(circular)).toThrow(/circular/);
});

it('retains persisted-JSON identities without copying the entire object', () => {
  for (const value of [{ optional: undefined, array: [undefined, , () => 1], n: Infinity, b: new Boolean(false) },
    { '2': { '10': 1, '2': 2 }, '10': new Date('2026-01-01') },
    { a: { toJSON(key: string) { return { key, optional: undefined }; } } }, new Number(5), '😀']) {
    expect(persistedJsonDigest(value)).toBe(sha256(stableJson(JSON.parse(JSON.stringify(value)))));
  }
  expect(() => persistedJsonDigest(Object(1n))).toThrow();
});

it('hashes an encoding larger than V8 MAX_STRING_LENGTH without assembling it', () => {
  const part = 'public evidence'.repeat(4096);
  const count = Math.ceil(constants.MAX_STRING_LENGTH / part.length) + 1;
  const expected = createHash('sha256').update('[');
  for (let index = 0; index < count; index++) expected.update((index ? ',' : '') + JSON.stringify(part));
  expected.update(']');
  expect(stableJsonDigest(Array(count).fill(part))).toBe(expected.digest('hex'));
}, 60_000);
