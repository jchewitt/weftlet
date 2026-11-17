import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from './init.js';

const dialog = vi.hoisted(() => ({ answers: [] as string[], questions: [] as string[] }));
vi.mock('node:readline/promises', () => ({ createInterface: () => ({
  question: async (text: string) => {
    dialog.questions.push(text);
    if (!dialog.answers.length) throw Error('Unexpected setup prompt');
    return dialog.answers.shift()!;
  }, close: () => {},
}) }));

it.each(['n', 'yes'])('interactive skill/source selection honors confirmation %s', async confirmation => {
  const root = await mkdtemp(join(tmpdir(), 'weftlet init dialog '));
  const inputTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const outputTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const output: string[] = [];
  const writer = vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => { output.push(String(text)); return true; }) as typeof process.stdout.write);
  try {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    dialog.answers = ['docs/product', 'docs/product/**', 'claude,codex', confirmation];
    dialog.questions = [];
    await runInit(['--directory', root, '--provider', 'claude-cli', '--repository-id', 'public-demo', '--code-root', 'src', '--model', 'sonnet']);
    expect(dialog.answers).toEqual([]);
    expect(dialog.questions.at(-1)).toContain('install the listed skills');
    expect(output.join('')).toContain('.claude/skills/context-graph-development/SKILL.md');
    if (confirmation === 'n') {
      expect(await readdir(root)).toEqual([]);
      expect(output.join('')).toContain('Setup cancelled');
    } else {
      const config = JSON.parse(await readFile(join(root, 'context-graph.config.json'), 'utf8'));
      expect(config.semanticSources).toEqual(['docs/product']);
      expect(config.approvedIntentSources).toEqual(['docs/product/**']);
      for (const folder of ['.claude', '.agents']) {
        expect(await readFile(join(root, folder, 'skills/context-graph-development/SKILL.md'), 'utf8')).toContain('impact.scan');
      }
    }
  } finally {
    writer.mockRestore();
    if (inputTTY) Object.defineProperty(process.stdin, 'isTTY', inputTTY); else Reflect.deleteProperty(process.stdin, 'isTTY');
    if (outputTTY) Object.defineProperty(process.stdout, 'isTTY', outputTTY); else Reflect.deleteProperty(process.stdout, 'isTTY');
    await rm(root, { recursive: true, force: true });
  }
});
