import { pairCompanionIndexes } from './companion-indexes.js';
import type { HistoryPolicy } from './history-policy.js';
import type { CacheObject } from '../inspection/layout.js';
import type { RetentionPolicy } from './policy.js';
import type { RetentionDecision } from './decisions.js';
import { historyAccounting, sumBytes, isCoordinationObject } from './history-accounting.js';

export type { RetentionDecision } from './decisions.js';
type Accounting = ReturnType<typeof historyAccounting>;
function reportTarget(observedBytes: number, selectedBytes: number, eligibleBytes: number, maxBytes: number | null) {
  const projectedBytes = observedBytes - selectedBytes, retainedMinimumBytes = observedBytes - eligibleBytes;
  return { maxBytes, observedBytes, selectedBytes, projectedBytes, retainedMinimumBytes,
    projectedOverageBytes: maxBytes === null ? 0 : Math.max(0, projectedBytes - maxBytes),
    protectedOverageBytes: maxBytes === null ? 0 : Math.max(0, retainedMinimumBytes - maxBytes) };
}
function totalsFor(paths: ReadonlySet<string>, byPath: Map<string, RetentionDecision>, account: Accounting) {
  const repositories = new Map<string, number>();
  for (const path of paths) {
    const item = byPath.get(path)!, repository = account.repositoryFor(path);
    if (repository !== undefined) repositories.set(repository, sumBytes([repositories.get(repository) ?? 0, item.logicalBytes]));
  }
  return { bytes: sumBytes([...paths].map(path => byPath.get(path)!.logicalBytes)), repositories };
}
/** Apply configured history targets only after canonical ownership/reference eligibility has been established. */
export function selectHistory(objects: CacheObject[], decisions: RetentionDecision[], policy: RetentionPolicy, reservedControlBytes = 0, completedHeads: ReadonlySet<string> = new Set()) {
  const history = policy.history;
  const account = historyAccounting(history ? objects : objects.filter(o => !isCoordinationObject(o.path)), policy.profiles, history ? reservedControlBytes : 0);
  const byPath = new Map(decisions.map(d => [d.path, d])), source = new Map(objects.map(o => [o.path, o]));
  const overrides = new Map(history?.mode === 'target' ? history.repositories?.map(r => [r.repositoryId, r] as const) : []);
  const eligible = new Set<string>(), selected = new Set<string>(), causes = new Map<string, string>();
  const snapshots = decisions.filter(d => d.disposition === 'candidate' && d.category === 'snapshot' &&
    history?.mode !== 'indefinite' && overrides.get(account.repositoryFor(d.path) ?? '')?.mode !== 'indefinite')
    .sort((a, b) => source.get(a.path)!.modifiedAt.localeCompare(source.get(b.path)!.modifiedAt, 'en') || a.path.localeCompare(b.path, 'en'));
  const companions = pairCompanionIndexes(objects, decisions, policy);
  const group = (snapshot: RetentionDecision) => {
    const index = companions.get(snapshot.path);
    return index ? [...snapshot.removeBefore, snapshot.path, index] : [...snapshot.removeBefore, snapshot.path];
  };
  for (const item of snapshots) for (const path of group(item)) eligible.add(path);
  const selection = new Selection(byPath, account, selected, causes);
  if (!history) { // Preserve existing explicit manual removal semantics when no history policy is configured.
    for (const d of decisions.filter(d => d.disposition === 'candidate')) { eligible.add(d.path); selection.add([d.path], 'manual-review'); }
  } else if (history.mode === 'target') {
    for (const path of completedHeads) {
      if (overrides.get(account.repositoryFor(path) ?? '')?.mode === 'indefinite') continue;
      eligible.add(path);
      selection.add([path], 'owner-completion');
    }
    selectTargets(snapshots, history, account, selection, group);
  }
  const available = totalsFor(eligible, byPath, account);
  const adjusted = decisions.map(d => adjustDecision(d, selected, causes, eligible, history?.mode === 'indefinite' || overrides.get(account.repositoryFor(d.path) ?? '')?.mode === 'indefinite'));
  return { objects: adjusted, history: {
    mode: history?.mode ?? 'manual', accountingScope: history ? 'root-with-persistent-controls' : 'evidence-only-manual-retry', ordering: 'oldest-filesystem-mtime-then-path', accounting: 'logical-by-path',
    root: reportTarget(account.observedBytes, selection.bytes, available.bytes, history?.mode === 'target' ? history.maxBytes : null),
    repositories: [...account.repositoryBytes].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([repositoryId, observed]) => {
      const choice = overrides.get(repositoryId);
      return { repositoryId, mode: choice?.mode ?? (history?.mode === 'target' ? 'inherit-root-target' : history?.mode ?? 'manual'),
        ...reportTarget(observed, selection.repositoryBytes.get(repositoryId) ?? 0, available.repositories.get(repositoryId) ?? 0,
          choice?.mode === 'target' ? choice.maxBytes : null) };
    }),
    unattributedBytes: account.unattributedBytes, coordinationBytes: account.coordinationBytes,
    selectedSnapshotFiles: adjusted.filter(d => d.disposition === 'candidate' && d.category === 'snapshot').length,
    retainedEligibleFiles: [...eligible].filter(path => !selected.has(path)).length,
    limitations: ['Configured modes account for all observed logical bytes, including undeclared/unattributed retained data and persistent controls. Legacy manual mode omits controls to preserve retry identity; cache usage reports the complete footprint. Shared extents/allocated disk recovery are not inferred.',
      'Transient admission/participant markers are excluded from target selection. New removal journal bytes are not included in projected totals.',
      'A root target covers only the explicitly selected root; use one non-overlapping user-wide managed root for a cross-profile target, not a separate allowance per profile.',
      'Modification time orders eligible history; it is not evidence age, last use or source authority. Targets never narrow graph coverage or prevent a necessary build.',
      'An indefinite repository override protects its history from root-target selection. Selected snapshot groups include required head retirements and any opted-in verified companion index.'] } };
}
function selectTargets(snapshots: RetentionDecision[], history: Extract<HistoryPolicy, { mode: 'target' }>, account: Accounting, selection: Selection, group: (snapshot: RetentionDecision) => string[]) {
  const overrides = new Map(history.repositories?.map(r => [r.repositoryId, r] as const));
  const perRepository = new Map<string, RetentionDecision[]>();
  for (const item of snapshots) {
    const repository = account.repositoryFor(item.path)!;
    const list = perRepository.get(repository) ?? []; list.push(item); perRepository.set(repository, list);
  }
  for (const [repository, target] of [...overrides].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (target.mode === 'indefinite') continue;
    for (const item of perRepository.get(repository) ?? []) {
      if (selection.repositoryRemaining(repository) <= target.maxBytes) break;
      selection.add(group(item), 'repository-target');
    }
  }
  for (const item of snapshots) {
    if (account.observedBytes - selection.bytes <= history.maxBytes) break;
    selection.add(group(item), 'root-target');
  }
}
class Selection {
  bytes = 0;
  repositoryBytes = new Map<string, number>();
  constructor(private byPath: Map<string, RetentionDecision>, private account: Accounting,
    private selected: Set<string>, private causes: Map<string, string>) {}
  repositoryRemaining(repository: string) { return (this.account.repositoryBytes.get(repository) ?? 0) - (this.repositoryBytes.get(repository) ?? 0); }
  add(paths: string[], cause: string) {
    for (const path of paths) {
      if (this.selected.has(path)) continue;
      const entry = this.byPath.get(path);
      if (!entry || entry.disposition !== 'candidate') throw Error('History selection has an ineligible group member');
      this.selected.add(path); this.causes.set(path, cause); this.bytes = sumBytes([this.bytes, entry.logicalBytes]);
      const repository = this.account.repositoryFor(path);
      if (repository !== undefined) this.repositoryBytes.set(repository, sumBytes([this.repositoryBytes.get(repository) ?? 0, entry.logicalBytes]));
    }
  }
}
function adjustDecision(d: RetentionDecision, selected: Set<string>, causes: Map<string, string>, eligible: Set<string>, indefinite: boolean): RetentionDecision {
  if (d.disposition !== 'candidate') return d;
  if (selected.has(d.path)) return { ...d, reasons: [...d.reasons, `history-selection:${causes.get(d.path)}`] };
  return { ...d, disposition: 'retain', removeBefore: [], recovery: 'retained; no recovery action proposed',
    reasons: [...d.reasons, indefinite ? 'history-indefinite' : eligible.has(d.path) ? 'history-within-target' : 'history-not-selected'] };
}
