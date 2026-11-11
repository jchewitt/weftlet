import { readFile } from 'node:fs/promises';

/** Resolve installed metadata independently of the consumer cwd. */
export async function toolkitIdentity(): Promise<{ name: string; version: string }> {
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  if (manifest.name !== '@weftlet/toolkit' || typeof manifest.version !== 'string') throw Error('Invalid installed toolkit metadata');
  return { name: manifest.name, version: manifest.version };
}
