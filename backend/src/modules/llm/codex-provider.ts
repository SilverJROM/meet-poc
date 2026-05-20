import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { runSpawn, type SpawnFn } from './process.js';

const DEFAULT_MODEL = 'gpt-5.3-codex-spark';
const DEFAULT_TIMEOUT_MS = 60_000;

interface CodexProviderOptions {
  spawnFn?: SpawnFn;
  tempDir?: string;
}

export class CodexProvider implements LlmProvider {
  readonly id = 'codex' as const;

  private readonly spawnFn?: SpawnFn;
  private readonly tempDir: string;

  constructor(options: CodexProviderOptions = {}) {
    this.spawnFn = options.spawnFn;
    this.tempDir = options.tempDir ?? os.tmpdir();
  }

  async available(): Promise<boolean> {
    try {
      await runSpawn('which', ['codex'], { timeoutMs: 5000, spawnFn: this.spawnFn });
      return true;
    } catch {
      return false;
    }
  }

  async invoke(req: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const model = req.model ?? DEFAULT_MODEL;
    const runDir = await fs.mkdtemp(path.join(this.tempDir, 'meet-poc-codex-'));
    const outputPath = path.join(runDir, 'last-message.txt');

    try {
      await runSpawn('codex', ['exec', '--output-last-message', outputPath, '--model', model, req.prompt], {
        timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        spawnFn: this.spawnFn,
      });
      const text = await fs.readFile(outputPath, 'utf8');
      return {
        text: text.trim(),
        provider: this.id,
        model,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  }
}
