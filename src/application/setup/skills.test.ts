import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySkillSetup, planSkillSetup, type SkillClient } from './skills.js';
import { applySetupFiles, contentDigest } from './files.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'weftlet skill setup '));
  roots.push(root); return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it('previews without writing, installs selected packaged skills and repeats without changes', async () => {
  const directory = await fixture();
  const options = { directory, clients: ['opencode', 'codex', 'claude', 'codex'] as SkillClient[] };
  const plan = await planSkillSetup(options);
  expect(await readdir(directory)).toEqual([]);
  expect(plan.files.map(file => file.path)).toEqual([
    '.agents/skills/context-graph-development/SKILL.md',
    '.claude/skills/context-graph-development/SKILL.md',
    '.opencode/skills/context-graph-development/SKILL.md',
  ]);
  expect(plan.files.every(file => file.action === 'create')).toBe(true);
  await applySkillSetup(options, plan.planId);
  for (const file of plan.files) {
    expect(await readFile(join(directory, file.path), 'utf8')).toBe(file.after);
    expect(file.after).toContain('name: context-graph-development');
    expect(file.after).toContain('impact.scan');
  }
  const repeat = await planSkillSetup(options);
  expect(repeat.files.every(file => file.action === 'unchanged')).toBe(true);
  await applySkillSetup(options, repeat.planId);
  expect(await readdir(directory)).not.toContain('.weftlet-setup.lock');
});

it('rejects a stale preview before applying any selected client and preserves custom instructions', async () => {
  const directory = await fixture();
  const options = { directory, clients: ['codex', 'claude'] as SkillClient[] };
  const plan = await planSkillSetup(options);
  const target = join(directory, plan.files[1]!.path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, 'My project skill');
  await expect(applySkillSetup(options, plan.planId)).rejects.toThrow('stale');
  await expect(readFile(join(directory, plan.files[0]!.path))).rejects.toThrow();
  const blocked = await planSkillSetup({ ...options, update: true });
  expect(blocked.ready).toBe(false);
  expect(blocked.files[1]!.action).toBe('conflict');
  await expect(applySkillSetup({ ...options, update: true }, blocked.planId)).rejects.toThrow('customized');
  expect(await readFile(target, 'utf8')).toBe('My project skill');
});

it('updates only an unchanged managed old template, preserving CRLF and detecting subsequent edits', async () => {
  const directory = await fixture();
  const options = { directory, clients: ['codex'] as SkillClient[] };
  const plan = await planSkillSetup(options), path = join(directory, plan.files[0]!.path);
  const old = '---\nname: context-graph-development\n---\nOlder instructions\n';
  const content = `${old}\n<!-- weftlet-managed-skill ${JSON.stringify({ schemaVersion: 1, packageVersion: '0.1.0', templateSha256: contentDigest(old) })} -->\n`;
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content.replaceAll('\n', '\r\n'));
  const preview = await planSkillSetup(options);
  expect(preview.files[0]!.action).toBe('update-available');
  expect(preview.ready).toBe(false);
  const updateOptions = { ...options, update: true }, update = await planSkillSetup(updateOptions);
  expect(update.files[0]!.action).toBe('update');
  await applySkillSetup(updateOptions, update.planId);
  const installed = await readFile(path, 'utf8');
  expect(installed).toContain('\r\n');
  expect((await planSkillSetup(options)).files[0]!.action).toBe('unchanged');
  await writeFile(path, installed.replace('Context Graph Development', 'Customized project workflow'));
  const edited = await planSkillSetup(updateOptions);
  expect(edited.files[0]!.action).toBe('conflict');
  await expect(applySkillSetup(updateOptions, edited.planId)).rejects.toThrow('customized');
  expect(await readFile(path, 'utf8')).toContain('Customized project workflow');
});

it('refuses directory junctions/symlinks and concurrent setup locks', async () => {
  const directory = await fixture(), outside = await fixture();
  await symlink(outside, join(directory, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(planSkillSetup({ directory, clients: ['codex'] })).rejects.toThrow('symbolic link or junction');
  expect(await readdir(outside)).toEqual([]);
  const options = { directory, clients: ['claude'] as SkillClient[] }, plan = await planSkillSetup(options);
  await writeFile(join(directory, '.weftlet-setup.lock'), 'active operation');
  await expect(applySkillSetup(options, plan.planId)).rejects.toThrow('Another setup');
  expect(await readFile(join(directory, '.weftlet-setup.lock'), 'utf8')).toBe('active operation');
  await expect(readFile(join(directory, plan.files[0]!.path))).rejects.toThrow();
});

it('validates target containment and all expected bytes before replacing files', async () => {
  const directory = await fixture();
  await writeFile(join(directory, 'one.txt'), 'original');
  await expect(applySetupFiles(directory, [
    { path: 'one.txt', before: 'original', after: 'changed' },
    { path: 'two.txt', before: 'stale', after: 'new' },
  ])).rejects.toThrow('stale');
  expect(await readFile(join(directory, 'one.txt'), 'utf8')).toBe('original');
  expect(await readdir(directory)).toEqual(['one.txt']);
  await expect(applySetupFiles(directory, [{ path: '../outside.txt', before: null, after: 'escape' }])).rejects.toThrow('inside the project');
  await expect(planSkillSetup({ directory, clients: ['unknown' as SkillClient] })).rejects.toThrow('Choose at least');
});

it('coordinates concurrent setup and keeps unrelated project instructions unchanged', async () => {
  const directory = await fixture();
  await writeFile(join(directory, 'AGENTS.md'), 'Existing project instructions');
  const options = { directory, clients: ['codex'] as SkillClient[] }, plan = await planSkillSetup(options);
  const outcomes = await Promise.allSettled([applySkillSetup(options, plan.planId), applySkillSetup(options, plan.planId)]);
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(await readFile(join(directory, plan.files[0]!.path), 'utf8')).toBe(plan.files[0]!.after);
  expect(await readFile(join(directory, 'AGENTS.md'), 'utf8')).toBe('Existing project instructions');
  expect(await readdir(directory)).not.toContain('.weftlet-setup.lock');
  expect((await readdir(join(directory, '.agents/skills/context-graph-development')))).toEqual(['SKILL.md']);
});
