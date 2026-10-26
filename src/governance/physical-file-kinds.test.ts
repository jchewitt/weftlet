import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import type { ExtractionContext, GraphSnapshot } from '@weftlet/core';
import { analyzeArchitecture, type ArchitecturePolicy } from './governance.js';
import { GitRepository } from '../repository/git.js';
import { RepositoryFileExtractor } from '../extraction/static.js';
import { RdfEvidenceGraph } from '../graph/rdf.js';
import { sha256, stableJson } from '../infrastructure/util.js';

it('composes actual architecture imports and declared memberships with neutral test-file evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'architecture-file-kinds-'));
  try {
    const files: Record<string, string> = {
      'src/domain/contract.ts': 'export interface Order { id: string }\n',
      'src/adapters/queue.ts': "import type { Order } from '../domain/contract';\nexport const enqueue = (order: Order) => order.id;\n",
      'src/adapters/queue.spec.ts': "import { enqueue } from './queue';\nexport const sample = enqueue({ id: 'public-spec' });\n",
      'src/adapters/queue.test.ts': "import { enqueue } from './queue';\nexport const sample = enqueue({ id: 'public-test' });\n",
    };
    for (const layer of ['domain', 'adapters']) await mkdir(join(root, 'src', layer), { recursive: true });
    await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)));
    await writeFile(join(root, '.gitattributes'), '* text eol=lf\n');
    const policy: ArchitecturePolicy = {
      schemaVersion: 1, roots: ['src'],
      modules: [
        { id: 'domain', path: '^src/domain/', domain: 'orders', layer: 'domain' },
        { id: 'adapters', path: '^src/adapters/', domain: 'orders', layer: 'adapters', adapter: true },
      ],
      contracts: [{ path: 'src/domain/contract.ts', owner: 'domain' }],
      rules: [
        { id: 'unique-owner', kind: 'contract-owner', approved: true, approvalRef: 'approved-public-example' },
        { id: 'no-cycles', kind: 'no-cycles', approved: true, approvalRef: 'approved-public-example' },
      ],
      advisory: { maxLines: 100, maxComplexity: 10, duplicateMinTokens: 100 },
    };
    const policySource = JSON.stringify(policy, null, 2) + '\n';
    await writeFile(join(root, 'architecture.policy.json'), policySource);
    const execute = promisify(execFile);
    const git = (...args: string[]) => execute('git', args, { cwd: root });
    await git('init', '--quiet');
    await git('add', '.');
    await git('-c', 'user.name=Public Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Public physical-file architecture');
    const repository = new GitRepository(root);
    const commitSha = await repository.resolveRef('HEAD');
    const result = await analyzeArchitecture(root, policy);
    expect(result.passed).toBe(true);
    expect(result.snapshot.manifest.extractorVersions['architecture-analyzer']).toBe('3');
    // Frozen analyzer-2 publication formula: identical inputs must not reuse the
    // old snapshot ID after physical-file nodes acquire their canonical kinds.
    const priorDigest = sha256(stableJson({
      inputs: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, sha256(content)])),
      policyDigest: sha256(stableJson(policy)), commitSha, dirtyPaths: [],
      tools: { dependencyCruiser: '18.7.0', eslint: '10.13.0', jscpd: '5.4.1', analyzer: '2' },
    }));
    expect(result.snapshot.manifest.snapshotId).not.toBe(`architecture-${priorDigest}`);
    expect(result.findings.filter((finding) => finding.category !== 'advisory')).toEqual([]);
    const context: ExtractionContext = {
      repositoryRoot: root, repositoryId: result.snapshot.manifest.repositoryId,
      ref: commitSha, commitSha, snapshotId: result.snapshot.manifest.snapshotId,
      changedPaths: [], deletedPaths: [], renamedPaths: {},
    };
    const neutral = await new RepositoryFileExtractor(repository, ['src'], 'public-index').extract(context);
    const facts = [...result.snapshot.facts, ...neutral];
    const composition: GraphSnapshot = { ...result.snapshot, facts,
      manifest: { ...result.snapshot.manifest, contentDigest: sha256(stableJson(facts)) } };
    expect(await new RdfEvidenceGraph(composition).validate()).toMatchObject({ conforms: true, issues: [] });

    for (const path of ['src/adapters/queue.spec.ts', 'src/adapters/queue.test.ts']) {
      const id = `component:file:${path}`;
      const occurrences = facts.flatMap((fact) => [fact.subject, fact.object]).filter((node) => node.id === id);
      expect(occurrences.length).toBeGreaterThanOrEqual(4);
      expect(occurrences.every((node) => node.kind === 'Evidence' && node.label === path)).toBe(true);
      const imported = result.snapshot.facts.find((fact) => fact.subject.id === id && fact.predicate === 'consumes')!;
      expect(imported).toMatchObject({
        subject: { kind: 'Evidence', attributes: { domain: 'orders', layer: 'adapters', module: 'adapters', adapter: true } },
        object: { id: 'component:file:src/adapters/queue.ts', kind: 'Component' },
        provenance: { path, startLine: 1, endLine: files[path]!.split('\n').length,
          digest: sha256(files[path]!), commitSha },
        extractor: { id: 'dependency-cruiser', version: '18.7.0' }, confidence: 1, authority: 'implemented',
      });
      const membership = result.snapshot.facts.find((fact) => fact.subject.id === 'module:adapters' &&
        fact.predicate === 'contains' && fact.object.id === id)!;
      expect(membership).toMatchObject({ subject: { kind: 'Component' }, object: { kind: 'Evidence' },
        authority: 'declared', confidence: 1, extractor: { id: 'architecture-policy', version: '1' },
        provenance: { path: 'architecture.policy.json', startLine: 1,
          endLine: policySource.split('\n').length, digest: sha256(policySource), commitSha },
      });
    }
    for (const path of ['src/domain/contract.ts', 'src/adapters/queue.ts']) {
      expect(facts.flatMap((fact) => [fact.subject, fact.object])
        .filter((node) => node.id === `component:file:${path}`).every((node) => node.kind === 'Component')).toBe(true);
    }
    expect(result.snapshot.facts).toContainEqual(expect.objectContaining({
      subject: { id: 'contract:file:src/domain/contract.ts', kind: 'Contract', label: 'src/domain/contract.ts' },
      predicate: 'operationallyOwnedBy', object: { id: 'module:domain', kind: 'Component', label: 'domain' },
      authority: 'declared', confidence: 1,
    }));
    expect(await new RdfEvidenceGraph(composition).facts()).toEqual(facts);

    const changedPath = 'src/adapters/queue.spec.ts';
    const changed = files[changedPath]! + 'export const another = true;\n';
    await writeFile(join(root, changedPath), changed);
    const draft = await analyzeArchitecture(root, policy);
    const draftImport = draft.snapshot.facts.find((fact) => fact.subject.id === `component:file:${changedPath}` &&
      fact.predicate === 'consumes')!;
    expect(draftImport).toMatchObject({ subject: { kind: 'Evidence' }, authority: 'draft', confidence: 1,
      provenance: { path: changedPath, startLine: 1, endLine: changed.split('\n').length,
        digest: sha256(changed), commitSha },
    });
    expect(draft.snapshot.manifest.snapshotId).not.toBe(result.snapshot.manifest.snapshotId);
    expect(await new RdfEvidenceGraph(draft.snapshot).validate()).toMatchObject({ conforms: true, issues: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);
