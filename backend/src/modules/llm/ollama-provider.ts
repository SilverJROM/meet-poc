import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { timeoutError } from './process.js';

const DEFAULT_MODEL = 'qwen2.5:7b';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_BASE_URL = 'http://localhost:11434';

interface OllamaProviderOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface OllamaGenerateResponse {
  response?: string;
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;

  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async available(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async invoke(req: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const model = req.model ?? DEFAULT_MODEL;
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);

    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: req.prompt, stream: false }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`ollama exited with status ${res.status}`);
      const body = (await res.json()) as OllamaGenerateResponse;
      return {
        text: String(body.response ?? '').trim(),
        provider: this.id,
        model,
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (controller.signal.aborted) throw timeoutError(timeoutMs);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
