import type { GraphFact } from '@weftlet/core';

export function sourceLink(source: GraphFact['provenance'], template?: string): string | undefined {
  if (!template) return undefined;
  if (!template.includes('{commit}') || !template.includes('{path}')) throw new Error('Source URL template must include {commit} and {path}');
  if (source.path.startsWith('/') || source.path.includes('\\') || source.path.split('/').some(part => part === '..' || part === '.')) throw new Error('Source path must be repository relative');
  const url = new URL(template.replaceAll('{commit}', encodeURIComponent(source.commitSha))
    .replaceAll('{path}', source.path.split('/').map(encodeURIComponent).join('/'))
    .replaceAll('{line}', String(source.startLine)));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source URL template must use HTTPS without credentials');
  return url.href;
}
