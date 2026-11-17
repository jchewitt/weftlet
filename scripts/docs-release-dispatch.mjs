import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packages, stableVersion } from './release-plan.mjs';

export const docsRepository = 'jchewitt/weftlet-docs';
export const docsReleaseEvent = 'weftlet-release-published';

/** Called only after the verified publish and release-record jobs have succeeded. */
export function documentationReleasePayload({ manifest, expectedCommit }) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? '') || manifest?.commit !== expectedCommit ||
      manifest.registry !== 'https://registry.npmjs.org' || !Array.isArray(manifest.packages) ||
      manifest.packages.length !== packages.length) {
    throw new Error('Docs dispatch requires the verified release manifest at the workflow commit');
  }
  const released = manifest.packages.map((pkg, index) => {
    if (pkg?.name !== packages[index].name || !stableVersion(pkg.version) ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(pkg.integrity ?? '')) {
      throw new Error('Invalid docs release package identity, version or integrity');
    }
    return { name: pkg.name, version: pkg.version, integrity: pkg.integrity };
  });
  if (new Set(released.map(pkg => pkg.version)).size !== 1) {
    throw new Error('Docs dispatch requires matching fixed-group package versions');
  }
  // Shared with the docs receiver: JSON property/order and lack of newline are deliberate.
  // Integrity is independently checked, but the durable identity is source plus version set.
  const identity = { sourceCommit: expectedCommit,
    packages: released.map(({ name, version }) => ({ name, version })) };
  const releaseKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { schemaVersion: 1, sourceRepository: 'jchewitt/weftlet', sourceCommit: expectedCommit,
    packages: released, releaseKey };
}

export async function dispatchReleaseDocumentation({ manifest, expectedCommit, request }) {
  const clientPayload = documentationReleasePayload({ manifest, expectedCommit });
  await request(`https://api.github.com/repos/${docsRepository}/dispatches`, {
    event_type: docsReleaseEvent, client_payload: clientPayload,
  });
  return clientPayload.releaseKey;
}

async function main() {
  if (process.argv.length !== 2 || process.env.GITHUB_REPOSITORY !== 'jchewitt/weftlet' ||
      process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Docs dispatch requires the main-branch release workflow with no command arguments');
  }
  if (!process.env.WEFTLET_DOCS_DISPATCH_TOKEN) {
    throw new Error('Missing WEFTLET_DOCS_DISPATCH_TOKEN: configure scoped docs-repository Contents:write authorization');
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (commit !== process.env.GITHUB_SHA) throw new Error('Docs dispatch checkout does not match the workflow commit');
  const manifest = JSON.parse(await readFile(new URL('../.release/manifest.json', import.meta.url), 'utf8'));
  const key = await dispatchReleaseDocumentation({ manifest, expectedCommit: commit,
    request: async (url, body) => {
      const response = await fetch(url, {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${process.env.WEFTLET_DOCS_DISPATCH_TOKEN}`,
          accept: 'application/vnd.github+json', 'content-type': 'application/json',
          'x-github-api-version': '2022-11-28' },
        body: JSON.stringify(body),
      });
      // Do not log API response bodies or credential-bearing request objects.
      if (response.status !== 204) throw new Error(`Docs release dispatch failed (HTTP ${response.status})`);
    },
  });
  console.log(`Docs dispatch accepted for release ${key}; receiver validation/publication remains separate.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Network errors can carry nested request details; retain a bounded safe error only.
    console.error(error instanceof TypeError ? 'Docs dispatch network failure; retry the failed job after checking its state.' : error.message);
    process.exitCode = 1;
  });
}
