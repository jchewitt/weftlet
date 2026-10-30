import type { CodeCoverageReport, CodeCoverageRequest, CodeCoverageService, SnapshotStore } from '@weftlet/core';
import { sha256, stableJson } from '../infrastructure/util.js';
import { projectCodeCoverage } from './code-coverage-projection.js';
import { parseCodeCoverageRequest } from './code-coverage-request.js';
import { renderCodeCoverage } from './code-coverage-renderer.js';
import { RdfEvidenceGraph } from './rdf.js';
import { snapshotContext } from './snapshot-context.js';

const version = 'code-coverage-query-v1';
function pageOffset(token: string | undefined, binding: string, length: number, pageSize: number): number {
  if (token === undefined) return 0;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const item = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (Object.keys(item).sort().join(',') !== 'binding,offset,version' || item.version !== version || item.binding !== binding ||
        !Number.isSafeInteger(item.offset) || item.offset < 1 || item.offset >= length || item.offset % pageSize) throw Error();
    return item.offset;
  } catch { throw Error('Invalid graph.coverage continuation or snapshot/query mismatch; restart graph.coverage'); }
}
export class SnapshotCodeCoverageService implements CodeCoverageService {
  constructor(private readonly store: Pick<SnapshotStore, 'read'>) {}
  async coverage(input: CodeCoverageRequest): Promise<CodeCoverageReport> {
    const request = parseCodeCoverageRequest(input), saved = await this.store.read(request.snapshotId);
    if (!saved) throw Error('No graph snapshot is available for that identifier');
    if (saved.manifest.snapshotId !== request.snapshotId) throw Error('Saved snapshot identity does not match the requested identifier');
    const facts = await new RdfEvidenceGraph(saved).facts();
    if (new Set(facts.map(fact => fact.id)).size !== facts.length) throw Error('Duplicate fact identities prevent stable code coverage');
    const projected = projectCodeCoverage({ ...saved, facts });
    const { continuation, ...query } = request;
    const binding = sha256(stableJson({ version, query, manifest: saved.manifest, facts, diagnostics: saved.diagnostics }));
    const fileView = request.projectRoot !== undefined;
    const files = fileView ? projected.files.filter(f => f.projectRoot === request.projectRoot) : [];
    const length = fileView ? files.length : projected.projects.length;
    const offset = pageOffset(continuation, binding, length, request.maxItems), end = Math.min(length, offset + request.maxItems);
    const project = projected.projects.find(p => p.root === request.projectRoot);
    const next = end < length ? Buffer.from(JSON.stringify({ version, binding, offset: end })).toString('base64url') : undefined;
    const plain: Omit<CodeCoverageReport, 'markdown'> = { snapshot: snapshotContext(saved.manifest), overview: projected.overview,
      view: fileView ? 'files' : 'projects', ...(fileView ? { project, projectStatus: projected.overview.status !== 'recorded' ? 'unknown' : project ? 'present' : 'absent' } : {}),
      projects: fileView ? [] : projected.projects.slice(offset, end), files: fileView ? files.slice(offset, end) : [],
      selection: { ...(fileView ? { projectRoot: request.projectRoot } : {}), maxItems: request.maxItems, offset, total: length,
        remaining: length - end, truncated: !!next, ...(next ? { continuation: next } : {}) } };
    return { ...plain, markdown: renderCodeCoverage(plain) };
  }
}
