import { describe, expect, it } from 'vitest';
import { OllamaProvider } from '../src/modules/llm/index.js';

describe('LLM real smoke', () => {
  it.skipIf(!process.env.LLM_SMOKE)('invokes local Ollama qwen2.5:7b', async () => {
    const provider = new OllamaProvider();

    const res = await provider.invoke({
      prompt: 'Reply with exactly: hello',
      model: 'qwen2.5:7b',
      timeoutMs: 60_000,
    });

    expect(res.text.toLowerCase()).toContain('hello');
  });
});
