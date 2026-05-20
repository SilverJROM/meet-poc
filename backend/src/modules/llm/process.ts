import { spawn as nodeSpawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export type SpawnFn = typeof nodeSpawn;

interface SpawnResult {
  stdout: string;
  stderr: string;
}

interface SpawnOptions {
  timeoutMs: number;
  spawnFn?: SpawnFn;
}

export function timeoutError(timeoutMs: number): Error {
  return new Error(`LLM provider timed out after ${timeoutMs}ms`);
}

export function runSpawn(command: string, args: string[], options: SpawnOptions): Promise<SpawnResult> {
  const spawnFn = options.spawnFn ?? nodeSpawn;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as ChildProcessByStdio<null, Readable, Readable>;

    const settle = (fn: () => void, clearKillTimer = true): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer && clearKillTimer) clearTimeout(killTimer);
      fn();
    };

    const timeoutTimer = setTimeout(() => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      settle(() => reject(timeoutError(options.timeoutMs)), false);
    }, options.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err) => settle(() => reject(err)));
    child.on('close', (code) => {
      settle(() => {
        if (code === 0) return resolve({ stdout, stderr });
        const detail = (stderr || stdout).trim();
        return reject(new Error(`${command} exited with code ${code}${detail ? `: ${detail}` : ''}`));
      });
    });
  });
}
