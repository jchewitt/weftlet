import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Run the installed CLI, provider contract and runtime assets from an independent packed consumer. */
export async function smokeTraversal(consumer, installedRoot, baseConfig, policy) {
  const config = { ...baseConfig, adapter: undefined, storagePath: '.context-graph/traversal-smoke',
    documentTraversal: { entryPoints: ['role-owner.md'], policy },
    semantic: { ...baseConfig.semantic, providerModule: './traversal-provider.mjs', maxDocuments: 2 } };
  await writeFile(join(consumer, 'traversal-provider.mjs'), `
export function createSemanticExtractor(config) {
  return { identity: config.providerIdentity, async extract(source) {
    const parsed = { assertions: [{ subject: { id: 'document:' + source.path, kind: 'Document', label: source.path },
      predicate: 'references', object: { id: 'capability:public-smoke', kind: 'Capability', label: 'Public smoke' },
      citation: { startLine: 1, endLine: 1 }, confidence: 1 }], diagnostics: [], oml: '' };
    return { parsed, rawModelOutput: JSON.stringify(parsed) };
  } };
}`);
  await writeFile(join(consumer, 'traversal.config.json'), JSON.stringify(config));
  const cli = (...args) => JSON.parse(execFileSync(process.execPath,
    [join(installedRoot, 'dist/cli.js'), ...args, '--config', 'traversal.config.json'],
    { cwd: consumer, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const plan = cli('hydrate', '--plan', '--json');
  if (!plan.ready || plan.estimates.extractions !== 2 || plan.documentSelection.documentPaths.length !== 4 ||
      plan.documentSelection.excluded.length !== 2) throw new Error('Installed traversal plan must exclude validation sources');
  const first = cli('hydrate', '--json', '--quiet');
  const repeated = cli('hydrate', '--json', '--quiet');
  if (first.semanticExtracted !== 2 || repeated.semanticExtracted !== 0 || repeated.semanticReused !== 2 ||
      first.snapshotId !== repeated.snapshotId || first.contentDigest !== repeated.contentDigest) {
    throw new Error('Installed traversal hydration must publish once and reuse unchanged module artifacts');
  }
  const pack = cli('impact', 'scan', '--owner-doc', 'role-owner.md', '--json');
  if (JSON.stringify(pack.snapshot.documentSelection) !== JSON.stringify(plan.documentSelection) ||
      !pack.facts.some(fact => fact.provenance.path === 'empty-review.md' && fact.sourceRole === 'validation') ||
      !pack.facts.some(fact => fact.provenance.path === 'draft-plan.md' && fact.sourceRole === 'plan' &&
        fact.sourceAuthority === 'inferred' && fact.authority === 'inferred' && fact.extractionReview === 'unreviewed')) {
    throw new Error('Installed saved queries must preserve traversal coverage and source/assertion authority');
  }
  const before = await readFile(join(consumer, config.storagePath, 'heads/default.json'), 'utf8');
  config.documentTraversal.maxReadDocuments = 1;
  await writeFile(join(consumer, 'traversal.config.json'), JSON.stringify(config));
  let blocked = false;
  try { cli('hydrate', '--json', '--quiet'); } catch { blocked = true; }
  if (!blocked || await readFile(join(consumer, config.storagePath, 'heads/default.json'), 'utf8') !== before) {
    throw new Error('Installed failed traversal must preserve the previous snapshot head');
  }
}
