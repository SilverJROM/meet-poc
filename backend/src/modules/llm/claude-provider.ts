import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { runSpawn, type SpawnFn } from './process.js';

const DEFAULT_MODEL = 'sonnet';
const DEFAULT_TIMEOUT_MS = 60_000;

interface ClaudeProviderOptions {
  spawnFn?: SpawnFn;
}

export class ClaudeProvider implements LlmProvider {
  readonly id = 'claude' as const;

  private readonly spawnFn?: SpawnFn;

  constructor(options: ClaudeProviderOptions = {}) {
    this.spawnFn = options.spawnFn;
  }

  async available(): Promise<boolean> {
    try {
      await runSpawn('which', ['claude'], { timeoutMs: 5000, spawnFn: this.spawnFn });
      return true;
    } catch {
      return false;
    }
  }

  async invoke(req: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const model = req.model ?? DEFAULT_MODEL;
    const result = await runSpawn('claude', ['-p', '--model', model, req.prompt], {
      timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      spawnFn: this.spawnFn,
    });

    return {
      text: result.stdout.trim(),
      provider: this.id,
      model,
      latencyMs: Date.now() - startedAt,
    };
  }
}
