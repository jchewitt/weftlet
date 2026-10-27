// Modified for standalone extraction; see docs/extraction-manifest.json.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { posix } from 'node:path';
import { isUtf8 } from 'node:buffer';

import type { ExtractionContext, SemanticSource } from "@weftlet/core";
import { sha256, slug } from "../infrastructure/util.js";

const execFileAsync = promisify(execFile);

export interface GitDelta {
  readonly changedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly renamedPaths: Readonly<Record<string, string>>;
}

export interface GitTextMatch {
  readonly path: string;
  readonly line: number;
}

/** Exact committed entries, relative to the configured repository root. */
export interface GitTreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: 'blob' | 'tree' | 'commit';
  readonly objectId: string;
  /** Git blob size in bytes; directories and gitlinks have no size. */
  readonly size?: number;
}

export class GitRepository {
  constructor(readonly root: string) {}

  private async execute(args: readonly string[], trim: boolean): Promise<string> {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: this.root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return trim ? stdout.trim() : stdout;
  }

  run(args: readonly string[]): Promise<string> {
    return this.execute(args, true);
  }

  resolveRef(ref: string): Promise<string> {
    return this.run(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  }

  async workingChanges(): Promise<readonly string[]> {
    const prefix = await this.run(['rev-parse', '--show-prefix']);
    const output = await this.execute(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], false);
    const records = output.split('\0');
    const paths = new Set<string>();
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (!record) continue;
      const path = posix.relative(prefix || '.', record.slice(3));
      if (!path.startsWith('.context-graph/')) paths.add(path);
      if (/[RC]/.test(record.slice(0, 2))) {
        const prior = records[++index];
        if (prior) paths.add(posix.relative(prefix || '.', prior));
      }
    }
    return [...paths].sort();
  }

  async firstParent(commitSha: string): Promise<string | undefined> {
    const parents = (await this.run(['show', '-s', '--format=%P', commitSha]))
      .split(/\s+/)
      .filter(Boolean);
    return parents[0];
  }

  async requireExactCleanCommit(commitSha: string): Promise<void> {
    const head = await this.resolveRef('HEAD');
    if (head !== commitSha) {
      throw new Error(`Ref resolved to ${commitSha}, but checked-out HEAD is ${head}`);
    }
    const status = await this.run(['status', '--porcelain=v1', '--untracked-files=all']);
    const relevant = status
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('.context-graph/'));
    if (relevant.length > 0) {
      throw new Error(
        'Committed hydration requires a clean worktree. Preserve and commit changes through normal review, then retry. Dirty-state overlays are not implemented.',
      );
    }
  }

  async listFilesAt(commitSha: string, roots: readonly string[]): Promise<readonly string[]> {
    if (roots.length === 0) return [];
    const output = await this.run(['ls-tree', '-r', '--name-only', commitSha, '--', ...roots]);
    return output.split('\n').filter(Boolean).sort();
  }

  listAllFilesAt(commitSha: string): Promise<readonly string[]> {
    return this.listFilesAt(commitSha, ['.']);
  }

  /** Read tree metadata without Git's quoted/newline path formatting or checkout access. */
  async listEntriesAt(commitSha: string): Promise<readonly GitTreeEntry[]> {
    const commit = await this.resolveRef(commitSha);
    // :./ selects the committed subtree at cwd; --full-tree makes output relative to
    // that subtree rather than applying cwd's prefix a second time in a nested project.
    const { stdout } = await execFileAsync('git',
      ['ls-tree', '-r', '-t', '-l', '-z', '--full-tree', `${commit}:./`], {
        cwd: this.root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
      });
    if (!isUtf8(stdout)) throw new Error('Git tree entry paths are not valid UTF-8');
    const output = stdout.toString('utf8');
    if (!output) return [];
    if (!output.endsWith('\0')) throw new Error('Malformed NUL-delimited Git tree listing');
    const seen = new Set<string>();
    const entries = output.slice(0, -1).split('\0').map((record): GitTreeEntry => {
      const match = /^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40}|[a-f0-9]{64}) +([0-9]+|-)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error('Malformed Git tree entry metadata');
      const mode = match[1]!;
      const type = match[2] as GitTreeEntry['type'];
      const objectId = match[3]!;
      const rawSize = match[4]!;
      const path = match[5]!;
      const size = rawSize === '-' ? undefined : Number(rawSize);
      const validMode = type === 'blob' ? ['100644', '100755', '120000'].includes(mode)
        : mode === (type === 'tree' ? '040000' : '160000');
      if (!validMode || (type === 'blob' ? size === undefined || !Number.isSafeInteger(size) || size < 0 : size !== undefined) ||
          path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') || seen.has(path)) {
        throw new Error('Malformed Git tree entry mode, size or path');
      }
      seen.add(path);
      return { path, mode, type, objectId, ...(size === undefined ? {} : { size }) };
    });
    return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  }

  readFileAt(commitSha: string, path: string): Promise<string> {
    // Git object paths are top-level-relative unless explicitly prefixed with ./.
    return this.execute(['show', `${commitSha}:./${path}`], false);
  }

  async findTextAt(
    commitSha: string,
    needles: readonly string[],
    roots: readonly string[],
  ): Promise<readonly GitTextMatch[]> {
    if (needles.length === 0) return [];
    let output = '';
    try {
      output = await this.run([
        'grep',
        '-n',
        '-F',
        ...needles.flatMap((needle) => ['-e', needle]),
        commitSha,
        '--',
        ...roots,
      ]);
    } catch (error) {
      if ((error as { code?: number }).code === 1) return [];
      throw error;
    }
    const matches = new Map<string, GitTextMatch>();
    for (const line of output.split('\n').filter(Boolean)) {
      const parsed = line.match(/^[^:]+:(.*?):(\d+):/);
      if (!parsed?.[1] || !parsed[2]) continue;
      const match = { path: parsed[1], line: Number(parsed[2]) };
      if (!matches.has(match.path)) matches.set(match.path, match);
    }
    return [...matches.values()].sort((left, right) => left.path.localeCompare(right.path));
  }

  async delta(
    baseSha: string | undefined,
    headSha: string,
    roots: readonly string[],
  ): Promise<GitDelta> {
    if (roots.length === 0) return { changedPaths: [], deletedPaths: [], renamedPaths: {} };
    if (!baseSha) {
      return {
        changedPaths: await this.listFilesAt(headSha, roots),
        deletedPaths: [],
        renamedPaths: {},
      };
    }
    const output = await this.run([
      'diff',
      '--relative',
      '--name-status',
      '--find-renames=50%',
      baseSha,
      headSha,
      '--',
      ...roots,
    ]);
    const changed = new Set<string>();
    const deleted = new Set<string>();
    const renamed: Record<string, string> = {};
    for (const line of output.split('\n').filter(Boolean)) {
      const [status = '', first = '', second = ''] = line.split('\t');
      if (status.startsWith('R')) {
        renamed[first] = second;
        changed.add(second);
        deleted.add(first);
      } else if (status === 'D') {
        deleted.add(first);
      } else {
        changed.add(first);
      }
    }
    return {
      changedPaths: [...changed].sort(),
      deletedPaths: [...deleted].sort(),
      renamedPaths: renamed,
    };
  }

  async semanticSources(
    context: Pick<ExtractionContext, 'commitSha'>,
    roots: readonly string[],
  ): Promise<readonly SemanticSource[]> {
    const paths = (await this.listFilesAt(context.commitSha, roots)).filter((path) =>
      /\.(md|mdx|txt)$/i.test(path),
    );
    return Promise.all(
      paths.map(async (path) => {
        const content = await this.readFileAt(context.commitSha, path);
        const explicit = content.match(/^semantic-id:\s*([^\s]+)\s*$/m)?.[1];
        return {
          stableSemanticId: explicit ?? `doc:${slug(path)}`,
          path,
          content,
          digest: sha256(content),
        };
      }),
    );
  }
}
