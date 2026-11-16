import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../application/delivery/export.js', () => ({ exportSnapshot: vi.fn(async () => ({ operation: 'export' })) }));
vi.mock('../application/delivery/import.js', () => ({ importSnapshot: vi.fn(async () => ({ operation: 'import' })) }));
import { exportSnapshot } from '../application/delivery/export.js';
import { importSnapshot } from '../application/delivery/import.js';
import { runSnapshotCommand } from './snapshot-delivery.js';
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('parses explicit trust, cache and activation settings and returns clean JSON', async () => {
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  expect(await runSnapshotCommand(['snapshot', 'import', '--input', 'bundle', '--expect-digest', 'a'.repeat(64),
    '--activate', '--expect-head', 'none', '--include-semantic', '--dry-run', '--max-bytes', '1234'], () => 'local.json')).toBe(true);
  expect(importSnapshot).toHaveBeenCalledWith('local.json', expect.objectContaining({ input: 'bundle', expectDigest: 'a'.repeat(64),
    activate: true, expectHead: null, includeSemantic: true, dryRun: true, maxBytes: 1234 }));
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toEqual({ operation: 'import' });
});
it('requires an exact selected export ID and rejects typo/duplicate/cross-operation options', async () => {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  await runSnapshotCommand(['snapshot', 'export', '--snapshot', 'saved', '--output', 'new', '--config', 'custom.json'], () => 'default');
  expect(exportSnapshot).toHaveBeenCalledWith('custom.json', expect.objectContaining({ snapshotId: 'saved', output: 'new', includeSemantic: false }));
  await expect(runSnapshotCommand(['snapshot', 'export', '--output', 'new'], () => 'default')).rejects.toThrow('requires --snapshot');
  await expect(runSnapshotCommand(['snapshot', 'export', '--activate'], () => 'default')).rejects.toThrow('Invalid');
  await expect(runSnapshotCommand(['snapshot', 'import', '--input', 'a', '--input', 'b'], () => 'default')).rejects.toThrow('Duplicate');
  expect(await runSnapshotCommand(['hydrate'], () => 'default')).toBe(false);
});
