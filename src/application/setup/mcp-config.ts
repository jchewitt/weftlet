import { isDeepStrictEqual } from 'node:util';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { applyEdits, modify, parse, parseTree, type Node, type ParseError } from 'jsonc-parser';
import { contentDigest } from './files.js';
import type { SkillClient } from './skills.js';

export type McpEntry = Record<string, unknown>;
export interface EntryReceipt { entrySha256: string; blockSha256?: string }
export const entryDigest = (value: unknown): string => {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : v;
  return contentDigest(JSON.stringify(canonical(value)) ?? 'undefined');
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// TOML tables use null prototypes. Compare values, while retaining actual TOML dates.
const plain = (value: unknown): unknown => Array.isArray(value) ? value.map(plain) :
  object(value) && !(value instanceof Date) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)])) : value;
const start = '# weftlet:mcp:start', end = '# weftlet:mcp:end';
const blockDigest = (text: string) => contentDigest(text.replaceAll('\r\n', '\n'));

function rejectDuplicates(node: Node | undefined): void {
  if (!node) throw Error('MCP configuration must contain an object');
  if (node.type === 'object') {
    const keys = node.children?.map(child => child.children?.[0]?.value) ?? [];
    if (new Set(keys).size !== keys.length) throw Error('Duplicate keys in MCP configuration; resolve them before setup');
  }
  for (const child of node.children ?? []) rejectDuplicates(child);
}

function parseConfiguration(client: SkillClient, text: string): Record<string, unknown> {
  let value: unknown;
  if (client === 'codex') {
    try { value = parseToml(text); } catch { throw Error('Invalid Codex TOML; fix the project configuration before setup'); }
  } else {
    const errors: ParseError[] = [];
    const options = { allowTrailingComma: client === 'opencode', disallowComments: client === 'claude' };
    const tree = parseTree(text, errors, options);
    if (errors.length) throw Error('Invalid client JSON/JSONC; fix the project configuration before setup');
    rejectDuplicates(tree);
    value = parse(text, [], options);
  }
  if (!object(value)) throw Error('MCP configuration must contain an object');
  return plain(value) as Record<string, unknown>;
}

function managedBlock(text: string): { from: number; to: number; text: string } | undefined {
  const from = text.indexOf(start), close = text.indexOf(end);
  if (from < 0 || close < from || text.lastIndexOf(start) !== from || text.lastIndexOf(end) !== close) return;
  return { from, to: close + end.length, text: text.slice(from, close + end.length) };
}

function registrationAction(existing: unknown, desired: McpEntry, before: string | null,
  block: ReturnType<typeof managedBlock>, receipt: EntryReceipt | undefined, client: SkillClient, update: boolean) {
  if (isDeepStrictEqual(existing, desired)) return 'unchanged';
  if (existing === undefined) return before === null ? 'create' : 'merge';
  const owned = receipt?.entrySha256 === entryDigest(existing) &&
    (client !== 'codex' || (block && receipt?.blockSha256 === blockDigest(block.text)));
  return owned ? (update ? 'update' : 'update-available') : 'conflict';
}

function receiptFor(client: SkillClient, after: string, desired: McpEntry): EntryReceipt {
  const block = client === 'codex' ? managedBlock(after) : undefined;
  return { entrySha256: entryDigest(desired), ...(block ? { blockSha256: blockDigest(block.text) } : {}) };
}

function editConfiguration(client: SkillClient, before: string | null, desired: McpEntry, section: string,
  replacing: boolean, block: ReturnType<typeof managedBlock>): string {
  const eol = before?.includes('\r\n') ? '\r\n' : '\n';
  if (client === 'codex') {
    const added = `${start}\n${stringifyToml({ mcp_servers: { weftlet: desired as never } }).trimEnd()}\n${end}`.replaceAll('\n', eol);
    return replacing ? before!.slice(0, block!.from) + added + before!.slice(block!.to) :
      `${before ?? ''}${before ? eol : ''}${added}${eol}`;
  }
  const input = before ?? '{}';
  const after = applyEdits(input, modify(input, [section, 'weftlet'], desired, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol },
  }));
  return before === null ? after + eol : after;
}

/** Patch only the Weftlet entry; retain comments/unrelated settings and reject conflicting ownership. */
export function mergeMcpConfiguration(client: SkillClient, before: string | null, desired: McpEntry, receipt?: EntryReceipt, update = false) {
  const section = client === 'codex' ? 'mcp_servers' : client === 'claude' ? 'mcpServers' : 'mcp';
  const original = before === null ? {} : parseConfiguration(client, before);
  const parent = original[section];
  if (parent !== undefined && !object(parent)) throw Error('MCP server settings must be an object/table');
  if (client === 'opencode' && object(parent) && 'servers' in parent) {
    throw Error('Setup currently targets OpenCode 1.x. A v2 mcp.servers configuration requires manual registration.');
  }
  const existing = (parent as Record<string, unknown> | undefined)?.weftlet;
  const block = client === 'codex' && before !== null ? managedBlock(before) : undefined;
  const action = registrationAction(existing, desired, before, block, receipt, client, update);
  if (['conflict', 'update-available'].includes(action)) return { after: before!, action, receipt };
  if (action === 'unchanged') return { after: before!, action, receipt: receiptFor(client, before!, desired) };
  const after = editConfiguration(client, before, desired, section, existing !== undefined, block);
  const expected = { ...original, [section]: { ...(parent as Record<string, unknown> ?? {}), weftlet: desired } };
  let parsed;
  try { parsed = parseConfiguration(client, after); }
  catch { throw Error('Client configuration cannot be extended without rewriting existing syntax; register Weftlet manually for this file'); }
  if (!isDeepStrictEqual(parsed, expected)) throw Error('MCP edit would change unrelated configuration; no files written');
  return { after, action, receipt: receiptFor(client, after, desired) };
}
