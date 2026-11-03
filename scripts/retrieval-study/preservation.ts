import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Byte-level inventory, including snapshots, heads, RDF and semantic artifacts. */
export async function evidenceBytes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(directory: string, relative: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(directory, entry.name), path);
      else if (entry.isFile()) {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(join(directory, entry.name))) hash.update(chunk);
        result[path] = hash.digest('hex');
      } else throw new Error('Unexpected non-file entry in public evidence fixture');
    }
  }
  await walk(root, '');
  return result;
}
