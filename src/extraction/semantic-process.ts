import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';

export interface SemanticRunOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}
export class SemanticProviderError extends Error {
  constructor(
    readonly code: 'timeout' | 'cancelled' | 'unavailable' | 'exit' | 'invalid-output',
    message: string,
    readonly retryable = false,
  ) { super(message); this.name = 'SemanticProviderError'; }
}

/** Intentionally never forwards provider stderr, prompts or environment values. */
export function runSemanticProcess(
  command: string, args: readonly string[], cwd: string, prompt: string,
  environment: Record<string, string | undefined>, options: SemanticRunOptions = {},
): Promise<void> {
  return executeSemanticProcess(command, args, cwd, prompt, environment, options).then(() => {});
}

/** Bounded structured stdout is retained privately; provider stderr is never forwarded. */
export function captureSemanticProcess(
  command: string, args: readonly string[], cwd: string, prompt: string,
  environment: Record<string, string | undefined>, maxOutputBytes: number, options: SemanticRunOptions = {},
): Promise<string> {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error('Invalid provider output limit');
  return executeSemanticProcess(command, args, cwd, prompt, environment, options, maxOutputBytes);
}

function executeSemanticProcess(
  command: string, args: readonly string[], cwd: string, prompt: string,
  environment: Record<string, string | undefined>, options: SemanticRunOptions, maxOutputBytes?: number,
): Promise<string> {
  if (options.signal?.aborted) {
    return Promise.reject(new SemanticProviderError('cancelled', 'Semantic extraction cancelled'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd, env: environment, stdio: ['pipe', maxOutputBytes ? 'pipe' : 'ignore', 'ignore'],
      windowsHide: true, detached: process.platform !== 'win32',
    });
    let failure: SemanticProviderError | undefined;
    const output: Buffer[] = [];
    let outputBytes = 0;
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else if (child.pid) {
          // npm's Windows launcher starts a native child. Terminate its tree, not just the Node wrapper.
          const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
          const taskkill = systemRoot ? join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill.exe';
          execFile(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => {
            if (error && child.exitCode === null && child.signalCode === null) {
              failure = new SemanticProviderError('unavailable', 'Could not terminate the semantic provider process tree');
              child.kill('SIGKILL');
            }
          });
        }
      } catch { /* The process may have already exited. */ }
    };
    const stop = (code: 'timeout' | 'cancelled' | 'invalid-output') => {
      if (failure) return;
      failure = new SemanticProviderError(code, code === 'invalid-output' ? 'Semantic output exceeds configured byte limit' : `Semantic extraction ${code}`);
      kill('SIGTERM');
      if (process.platform !== 'win32') {
        killTimer = setTimeout(() => kill('SIGKILL'), 1000);
        killTimer.unref();
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      if (failure) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes!) { output.length = 0; stop('invalid-output'); }
      else output.push(chunk);
    });
    const cancel = () => stop('cancelled');
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => stop('timeout'), options.timeoutMs ?? 120_000);
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', cancel);
    };
    child.once('error', () => {
      cleanup();
      reject(new SemanticProviderError('unavailable', 'Semantic provider executable could not start'));
    });
    child.once('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code === 0) resolve(Buffer.concat(output).toString('utf8'));
      else reject(new SemanticProviderError('exit', `Semantic provider exited with status ${code}`, code === 75));
    });
    child.stdin!.on('error', () => { /* The exit status supplies the safe failure report. */ });
    child.stdin!.end(prompt);
    if (options.signal?.aborted) cancel();
  });
}
