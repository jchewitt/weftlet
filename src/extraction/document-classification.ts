import { posix } from 'node:path';
import { sha256, stableJson, type SourceDocumentRole, type SourceOwnership } from '@weftlet/core';
import { matchesRepositoryGlob } from '../repository/glob.js';

export interface DocumentClassificationPolicy {
  readonly schemaVersion: 1;
  readonly roles?: readonly { readonly id: string; readonly pattern: string;
    readonly role: Exclude<SourceDocumentRole, 'unclassified'> }[];
  readonly owners?: readonly { readonly id: string; readonly pattern: string; readonly ownerDocument: string }[];
}
export interface DocumentClassificationContext {
  readonly approvedIntentSources: readonly string[];
  readonly evidenceRoots: readonly string[];
  readonly availableDocuments: readonly string[];
}
export interface DocumentClassification {
  readonly path: string;
  readonly sourceRole: SourceDocumentRole;
  readonly roleStatus: 'default' | 'explicit' | 'ambiguous';
  readonly matchedRoleMappings: readonly string[];
  readonly approvedBy: readonly string[];
  readonly sourceAuthority: 'declared' | 'inferred';
  readonly ownership: SourceOwnership;
}
export interface DocumentClassificationIssue {
  readonly code: string;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly paths: readonly string[];
}
export interface DocumentClassificationReport {
  readonly policyDigest: string;
  readonly documents: readonly DocumentClassification[];
  readonly issues: readonly DocumentClassificationIssue[];
  readonly complete: boolean;
}

const maximumDocuments = 10_000;
const maximumMappings = 1000;
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort(compare);
const roles = new Set(['intent', 'plan', 'validation', 'reference']);
const unsafe = /[\x00-\x1f\x7f-\x9f\uFFFD:[\]{}]/;
type RecordValue = Record<string, unknown>;
type RoleClassification = Pick<DocumentClassification, 'sourceRole' | 'roleStatus' | 'matchedRoleMappings' | 'approvedBy' | 'sourceAuthority'>;
interface ClassificationSettings {
  readonly policy: Required<DocumentClassificationPolicy>;
  readonly approvedIntentSources: readonly string[];
  readonly evidenceRoots: readonly string[];
  readonly availableDocuments: ReadonlySet<string>;
}

function record(value: unknown, name: string, fields: readonly string[]): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new Error(`${name} must be an object containing only supported fields`);
  }
  return value as RecordValue;
}

function array(value: unknown, name: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${name} must be an array of at most ${maximum} entries`);
  }
  return value;
}

function documentPath(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || value !== value.trim() ||
      unsafe.test(value) || /[\\*?]/.test(value) || value.startsWith('/') || value.startsWith('../') ||
      posix.normalize(value) !== value || !/\.(?:md|mdx|txt)$/i.test(value)) {
    throw new Error(`${name} must be a canonical repository-relative .md, .mdx or .txt document path`);
  }
  return value;
}

function documentPaths(value: unknown, name: string): readonly string[] {
  const paths = array(value, name, maximumDocuments).map(path => documentPath(path, name));
  if (new Set(paths).size !== paths.length) throw new Error(`${name} must not contain duplicate document paths`);
  return paths.sort(compare);
}

function pattern(value: unknown, name: string, evidenceRoot = false): string {
  if (typeof value !== 'string' || value.length > 4096 || value !== value.trim() || unsafe.test(value)) {
    throw new Error(`${name} must be a repository-relative pattern using only * and ? wildcards`);
  }
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  const result = evidenceRoot ? normalized.replace(/\/$/, '') || '.' : normalized;
  const segments = result.split('/');
  if (!result || result.startsWith('!') || result.startsWith('/') ||
      (result !== '.' && segments.some(segment => !segment || segment === '.' || segment === '..')) ||
      (!evidenceRoot && result === '.') || /\*{3}/.test(result)) {
    throw new Error(`${name} must be a repository-relative pattern using only * and ? wildcards`);
  }
  return result;
}

function patterns(value: unknown, name: string, evidenceRoot = false): readonly string[] {
  return uniqueSorted(array(value, name, maximumMappings).map(item => pattern(item, name, evidenceRoot)));
}

function mappingId(value: unknown, ids: Set<string>): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value) || ids.has(value)) {
    throw new Error('Document policy mapping IDs must be unique ASCII identifiers of at most 128 characters');
  }
  ids.add(value);
  return value;
}

/** Parse bounded explicit policy; normalize ordering, never infer approval or ownership. */
export function parseDocumentClassificationPolicy(value: unknown): DocumentClassificationPolicy {
  const input = record(value, 'Document policy', ['schemaVersion', 'roles', 'owners']);
  if (input.schemaVersion !== 1) throw new Error('Document policy schemaVersion must be 1');
  const ids = new Set<string>();
  const roleMappings = array(input.roles === undefined ? [] : input.roles, 'Document policy roles', maximumMappings).map(value => {
    const mapping = record(value, 'Document role mapping', ['id', 'pattern', 'role']);
    if (typeof mapping.role !== 'string' || !roles.has(mapping.role)) throw new Error('Document policy role must be intent, plan, validation or reference');
    return { id: mappingId(mapping.id, ids), pattern: pattern(mapping.pattern, 'Document role pattern'),
      role: mapping.role as Exclude<SourceDocumentRole, 'unclassified'> };
  });
  const ownerMappings = array(input.owners === undefined ? [] : input.owners, 'Document policy owners', maximumMappings).map(value => {
    const mapping = record(value, 'Document owner mapping', ['id', 'pattern', 'ownerDocument']);
    return { id: mappingId(mapping.id, ids), pattern: pattern(mapping.pattern, 'Document owner pattern'),
      ownerDocument: documentPath(mapping.ownerDocument, 'Owner document') };
  });
  return { schemaVersion: 1, roles: roleMappings.sort((a, b) => compare(a.id, b.id)),
    owners: ownerMappings.sort((a, b) => compare(a.id, b.id)) };
}

function evidenceRootMatches(path: string, root: string): boolean {
  return root === '.' || path === root || path.startsWith(`${root}/`) ||
    matchesRepositoryGlob(path, root) || matchesRepositoryGlob(path, `${root}/**`);
}

function classifyRole(path: string, settings: ClassificationSettings): RoleClassification {
  const approvedBy = settings.approvedIntentSources.filter(pattern => matchesRepositoryGlob(path, pattern));
  const matches = settings.policy.roles.filter(mapping => matchesRepositoryGlob(path, mapping.pattern));
  const selectedRoles = new Set(matches.map(mapping => mapping.role));
  let sourceRole: SourceDocumentRole = 'unclassified';
  let roleStatus: RoleClassification['roleStatus'] = 'default';
  if (selectedRoles.size > 1) roleStatus = 'ambiguous';
  else if (matches.length) { sourceRole = matches[0]!.role; roleStatus = 'explicit'; }
  else if (settings.evidenceRoots.some(root => evidenceRootMatches(path, root))) sourceRole = 'validation';
  else if (approvedBy.length) sourceRole = 'intent';
  return { sourceRole, roleStatus, matchedRoleMappings: matches.map(mapping => mapping.id), approvedBy,
    sourceAuthority: approvedBy.length ? 'declared' : 'inferred' };
}

function classifyOwnership(path: string, role: SourceDocumentRole, settings: ClassificationSettings): SourceOwnership {
  const mappings = settings.policy.owners.filter(mapping => matchesRepositoryGlob(path, mapping.pattern));
  const ownerDocuments = uniqueSorted(mappings.map(mapping => mapping.ownerDocument));
  const mappingIds = mappings.map(mapping => mapping.id);
  const result = (status: SourceOwnership['status']): SourceOwnership => ({ status, ownerDocuments, mappingIds });
  if (!ownerDocuments.length) return result(['validation', 'reference'].includes(role) ? 'not-required' : 'missing');
  if (ownerDocuments.length > 1) return result('ambiguous');
  const owner = ownerDocuments[0]!;
  if (!settings.availableDocuments.has(owner)) return result('unavailable');
  const classification = classifyRole(owner, settings);
  if (!classification.approvedBy.length) return result('unapproved');
  if (classification.sourceRole !== 'intent' || classification.roleStatus === 'ambiguous') return result('ineligible');
  return result('resolved');
}

const ownershipMessages: Partial<Record<SourceOwnership['status'], string>> = {
  missing: 'This document role requires an explicit source-of-truth owner mapping.',
  ambiguous: 'Explicit owner mappings disagree on the source-of-truth document.',
  unavailable: 'The explicit owner is not an available read document in the selected coverage.',
  unapproved: 'The explicit owner does not match the configured approved intent sources.',
  ineligible: 'The approved explicit owner does not have an unambiguous intent role.',
};

function classificationIssues(document: DocumentClassification): readonly DocumentClassificationIssue[] {
  const issues: DocumentClassificationIssue[] = [];
  const add = (code: string, message: string, paths: readonly string[]) =>
    issues.push({ code, severity: 'warning', message, paths });
  if (document.roleStatus === 'ambiguous') add('role-ambiguous', 'Explicit document role mappings conflict; no role was selected.', [document.path]);
  else if (document.sourceRole === 'unclassified') add('role-unclassified', 'No explicit role or configured default classifies this document.', [document.path]);
  const message = ownershipMessages[document.ownership.status];
  if (message) add(`ownership-${document.ownership.status}`, message, uniqueSorted([document.path, ...document.ownership.ownerDocuments]));
  return issues;
}

/** Classify source-level evidence only; links, owner mappings and roles never approve a child. */
export function classifyDocumentSources(paths: readonly string[], context: DocumentClassificationContext,
  policy?: DocumentClassificationPolicy): DocumentClassificationReport {
  const selected = documentPaths(paths, 'Document paths');
  const normalized = parseDocumentClassificationPolicy(policy === undefined ? { schemaVersion: 1 } : policy);
  const settings: ClassificationSettings = {
    policy: { schemaVersion: 1, roles: normalized.roles!, owners: normalized.owners! },
    approvedIntentSources: patterns(context.approvedIntentSources, 'Approved intent source patterns'),
    evidenceRoots: patterns(context.evidenceRoots, 'Evidence roots', true),
    availableDocuments: new Set(documentPaths(context.availableDocuments, 'Available document paths')),
  };
  const documents = selected.map(path => {
    const classification = classifyRole(path, settings);
    return { path, ...classification, ownership: classifyOwnership(path, classification.sourceRole, settings) };
  });
  const issues = documents.flatMap(classificationIssues);
  const policyDigest = sha256(stableJson({ policy: settings.policy,
    approvedIntentSources: settings.approvedIntentSources, evidenceRoots: settings.evidenceRoots }));
  return { policyDigest, documents, issues, complete: !issues.length };
}
