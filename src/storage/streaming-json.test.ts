import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readJsonFile, readJsonProperty, writeJsonFile } from './streaming-json.js';
import { digestRdfFiles } from '../extraction/ontology.js';
import { sha256, stableJson } from '../infrastructure/util.js';

it('writes ordinary JSON bytes and reads legacy files, Unicode chunks and malformed files strictly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-json-'));
  try {
    const path = join(root, 'snapshot.json');
    const value = { facts: Array.from({ length: 2000 }, (_, i) => ({ id: i,
      optional: undefined, text: `\n"\\\0\ud800😀 ${i}`, values: [undefined, NaN, true] })) };
    await writeJsonFile(path, value);
    expect(await readFile(path, 'utf8')).toBe(JSON.stringify(value));
    expect(await readJsonFile(path)).toEqual(JSON.parse(JSON.stringify(value)));
    await expect(writeJsonFile(path, {})).rejects.toMatchObject({ code: 'EEXIST' });
    await writeFile(path, '{"old":true,"__proto__":{"polluted":true}}');
    expect(await readJsonFile(path)).toEqual(JSON.parse(await readFile(path, 'utf8')));
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    const splitObject = '{"padding":"' + 'x'.repeat(65500) + '","__proto__":{"public":true},"manifest":{"contentDigest":"ok"},"facts":[1,2]}';
    await writeFile(path, splitObject);
    const split = await readJsonFile<Record<string, unknown>>(path);
    expect(Object.getPrototypeOf(split)).toBe(Object.prototype);
    expect(Object.hasOwn(split, '__proto__')).toBe(true);
    expect(split).toEqual(JSON.parse(splitObject));
    expect(await readJsonProperty(path, 'manifest')).toEqual({ contentDigest: 'ok' });
    // Test every truncated prefix, including EOF exactly after a completed nested object.
    const text = '{"manifest":{"contentDigest":"ok"},"facts":[{"id":"one"},{"id":"two"}]}';
    for (let index = 1; index < text.length; index++) {
      await writeFile(path, text.slice(0, index));
      await expect(readJsonFile(path)).rejects.toBeInstanceOf(SyntaxError);
      await expect(readJsonProperty(path, 'manifest')).rejects.toBeInstanceOf(SyntaxError);
    }
    for (const bad of ['{"facts":[{"id":"x"}', '{"a":1} trailing', '{"a":1,}', '']) {
      await writeFile(path, bad);
      await expect(readJsonFile(path)).rejects.toBeInstanceOf(SyntaxError);
    }
    await expect(readJsonFile(join(root, 'absent'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('preserves openCAESAR file-content digest encoding across UTF-8 stream boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet-rdf-digest-'));
  try {
    const parts = [{ path: 'a.nt', content: 'x'.repeat(65535) + '😀\n"\\\r\0' }, { path: 'b.nt', content: '' }];
    for (const part of parts) await writeFile(join(root, part.path), part.content);
    expect(await digestRdfFiles(root, parts.map(part => join(root, part.path)))).toBe(sha256(stableJson(parts)));
    expect(await digestRdfFiles(root, [])).toBe(sha256('[]'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
