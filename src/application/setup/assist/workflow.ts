import { parseDocument } from 'yaml';
import { stableJson } from '../../../infrastructure/util.js';

/** Add only a deterministic no-model job; retain existing trigger, permissions, jobs and comments. */
export function integrateChecks(before: string, scaffold: string) {
  const document = parseDocument(before), generated = parseDocument(scaffold);
  if (document.errors.length || generated.errors.length) throw Error('Existing workflow is not valid YAML');
  const original = document.toJS({ maxAliasCount: 0 }), template = generated.toJS({ maxAliasCount: 0 });
  if (!original || typeof original !== 'object' || !original.jobs || Array.isArray(original.jobs) || typeof original.jobs !== 'object') throw Error('Existing workflow needs a jobs map');
  const triggers = typeof original.on === 'string' ? [original.on] : Array.isArray(original.on) ? original.on : Object.keys(original.on ?? {});
  if (!triggers.length || triggers.some((name: string) => !['push', 'pull_request', 'workflow_dispatch'].includes(name))) {
    throw Error('Assisted CI integration supports push, pull_request and workflow_dispatch only; use a separate scaffold for privileged/reusable workflows');
  }
  const job = { ...template.jobs.checks, permissions: { contents: 'read' }, env: template.env, defaults: template.defaults };
  const old = original.jobs.weftlet_checks;
  if (old && stableJson(old) !== stableJson(job)) throw Error('Existing weftlet_checks job differs; preserve it and review the standalone CI proposal manually');
  if (old) return { after: before, job };
  document.setIn(['jobs', 'weftlet_checks'], job);
  const after = document.toString({ lineWidth: 0 });
  const expected = { ...original, jobs: { ...original.jobs, weftlet_checks: job } };
  if (stableJson(parseDocument(after).toJS({ maxAliasCount: 0 })) !== stableJson(expected)) throw Error('Workflow integration changed unrelated configuration');
  return { after, job };
}
