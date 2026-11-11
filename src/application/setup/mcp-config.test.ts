import { expect, it } from 'vitest';
import { parse } from 'smol-toml';
import { parse as parseJsonc } from 'jsonc-parser';
import { mergeMcpConfiguration } from './mcp-config.js';

const entry = { command: 'node', args: ['-e', 'portable bootstrap'] };
it('preserves unrelated TOML tables/comments and CRLF while owning only the managed entry', () => {
  const before = '# personal settings\r\nmodel = "chosen"\r\n[mcp_servers.other]\r\ncommand = "other"\r\n[mcp_servers.other.env]\r\nSECRET = "keep private"\r\n';
  const first = mergeMcpConfiguration('codex', before, entry);
  expect(first.after.startsWith(before)).toBe(true);
  expect(first.after).not.toMatch(/(?<!\r)\n/);
  expect(parse(first.after).mcp_servers).toEqual({ other: { command: 'other', env: { SECRET: 'keep private' } }, weftlet: entry });
  const next = { ...entry, args: ['new'] };
  expect(mergeMcpConfiguration('codex', first.after, next, first.receipt).action).toBe('update-available');
  expect(mergeMcpConfiguration('codex', first.after.replaceAll('\r\n', '\n'), next, first.receipt, true).action).toBe('update');
  const updated = mergeMcpConfiguration('codex', first.after, next, first.receipt, true);
  expect(updated.action).toBe('update');
  expect(updated.after.startsWith(before)).toBe(true);
  expect(mergeMcpConfiguration('codex', updated.after, next, updated.receipt).action).toBe('unchanged');
  const customized = first.after.replace('portable bootstrap', 'my bootstrap');
  expect(mergeMcpConfiguration('codex', customized, next, first.receipt, true).action).toBe('conflict');
});
it.each(['claude', 'opencode'] as const)('merges %s config without changing other servers or custom settings', client => {
  const section = client === 'claude' ? 'mcpServers' : 'mcp';
  const before = client === 'claude' ? '{"custom":7,"mcpServers":{"other":{"env":{"TOKEN":"private"}}}}\n' :
    '{\n// keep this comment\n"custom":7,"mcp":{"other":{"environment":{"TOKEN":"private"}}},\n}\n';
  const first = mergeMcpConfiguration(client, before, entry);
  expect(parseJsonc(first.after)[section].other).toEqual(parseJsonc(before)[section].other);
  expect(parseJsonc(first.after).custom).toBe(7);
  if (client === 'opencode') expect(first.after).toContain('// keep this comment');
  const next = { ...entry, args: ['updated'] };
  expect(mergeMcpConfiguration(client, first.after, next).action).toBe('conflict');
  expect(mergeMcpConfiguration(client, first.after, next, first.receipt).action).toBe('update-available');
  expect(mergeMcpConfiguration(client, first.after, next, first.receipt, true).action).toBe('update');
});
it('rejects malformed, duplicate and incompatible config without leaking its contents', () => {
  for (const input of ['{"mcp":{},"mcp":{}}', '{"other":{"token":1,"token":2}}', '{"private": bad}', '[]']) {
    expect(() => mergeMcpConfiguration('opencode', input, entry)).toThrow();
  }
  expect(() => mergeMcpConfiguration('claude', '{/*secret*/}', entry)).toThrow('Invalid client JSON');
  expect(() => mergeMcpConfiguration('codex', 'secret = broken', entry)).toThrow('Invalid Codex TOML');
  expect(() => mergeMcpConfiguration('opencode', '{"mcp":{"servers":{}}}', entry)).toThrow('OpenCode 1.x');
  expect(() => mergeMcpConfiguration('codex', 'mcp_servers = {other = {command = "custom"}}', entry)).toThrow('without rewriting');
});
