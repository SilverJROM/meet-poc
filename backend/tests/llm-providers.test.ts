import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { seedUser } from '../scripts/seed.js';
import { createSession } from '../src/modules/auth/sessions.js';
import { ClaudeProvider, CodexProvider, LlmService, OllamaProvider, type LlmProvider } from '../src/modules/llm/index.js';
import type { SpawnFn } from '../src/modules/llm/process.js';
import { createApp } from '../src/server.js';
import { createTestDb } from './helpers.js';

type FakeChild = EventEmitter & {
  stdout: EventEmitter & { setEncoding: (encoding: string) => void };
  stderr: EventEmitter & { setEncoding: (encoding: string) => void };
  kill: ReturnType<typeof vi.fn>;
};

function fakeStream(): EventEmitter & { setEncoding: (encoding: string) => void } {
  return Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
}

function fakeSpawn(handler: (command: string, args: string[], child: FakeChild) => void): SpawnFn {
  return vi.fn((command: string, args: readonly string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: fakeStream(),
      stderr: fakeStream(),
      kill: vi.fn(),
    }) as FakeChild;
    handler(command, [...args], child);
    return child;
  }) as unknown as SpawnFn;
}

function completingSpawn(exitCode = 0, stdout = '', stderr = ''): SpawnFn {
  return fakeSpawn((_command, _args, child) => {
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', exitCode);
    });
  });
}

describe('ClaudeProvider', () => {
  it('returns available when which claude exits 0', async () => {
    const provider = new ClaudeProvider({ spawnFn: completingSpawn(0) });

    await expect(provider.available()).resolves.toBe(true);
  });

  it('returns unavailable when which claude exits nonzero', async () => {
    const provider = new ClaudeProvider({ spawnFn: completingSpawn(1) });

    await expect(provider.available()).resolves.toBe(false);
  });

  it('invokes claude with the requested model and prompt', async () => {
    const spawnFn = completingSpawn(0, 'cleaned transcript\n');
    const provider = new ClaudeProvider({ spawnFn });

    const res = await provider.invoke({ prompt: 'cleanup this', model: 'sonnet' });

    expect(spawnFn).toHaveBeenCalledWith('claude', ['-p', '--model', 'sonnet', 'cleanup this'], expect.any(Object));
    expect(res).toMatchObject({ provider: 'claude', model: 'sonnet', text: 'cleaned transcript' });
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('uses sonnet as the default model', async () => {
    const spawnFn = completingSpawn(0, 'ok');
    const provider = new ClaudeProvider({ spawnFn });

    await provider.invoke({ prompt: 'x' });

    expect(spawnFn).toHaveBeenCalledWith('claude', ['-p', '--model', 'sonnet', 'x'], expect.any(Object));
  });

  it('terminates and rejects when invocation exceeds timeoutMs', async () => {
    vi.useFakeTimers();
    let childRef: FakeChild | undefined;
    const provider = new ClaudeProvider({
      spawnFn: fakeSpawn((_command, _args, child) => {
        childRef = child;
      }),
    });

    try {
      const result = provider.invoke({ prompt: 'slow', timeoutMs: 5 });
      const assertion = expect(result).rejects.toThrow('LLM provider timed out after 5ms');
      await vi.advanceTimersByTimeAsync(5);
      await assertion;
      expect(childRef?.kill).toHaveBeenCalledWith('SIGTERM');
      await vi.advanceTimersByTimeAsync(5000);
      expect(childRef?.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CodexProvider', () => {
  it('invokes codex with output-last-message and returns tempfile contents', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-test-codex-'));
    const spawnFn = fakeSpawn((_command, args, child) => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      fs.writeFileSync(outputPath, 'codex final answer\n');
      queueMicrotask(() => child.emit('close', 0));
    });
    const provider = new CodexProvider({ spawnFn, tempDir });

    const res = await provider.invoke({ prompt: 'cleanup', model: 'gpt-5.3-codex-spark' });

    expect(spawnFn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--output-last-message', expect.stringContaining('last-message.txt'), '--model', 'gpt-5.3-codex-spark', 'cleanup'],
      expect.any(Object),
    );
    expect(res).toMatchObject({ provider: 'codex', model: 'gpt-5.3-codex-spark', text: 'codex final answer' });
    expect(fs.readdirSync(tempDir)).toHaveLength(0);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses gpt-5.3-codex-spark as the default model', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-test-codex-'));
    const spawnFn = fakeSpawn((_command, args, child) => {
      const outputPath = args[args.indexOf('--output-last-message') + 1];
      fs.writeFileSync(outputPath, 'ok');
      queueMicrotask(() => child.emit('close', 0));
    });
    const provider = new CodexProvider({ spawnFn, tempDir });

    await provider.invoke({ prompt: 'x' });

    expect(spawnFn).toHaveBeenCalledWith(
      'codex',
      ['exec', '--output-last-message', expect.any(String), '--model', 'gpt-5.3-codex-spark', 'x'],
      expect.any(Object),
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects with the same timeout contract as CLI providers', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-test-codex-'));
    const provider = new CodexProvider({
      spawnFn: fakeSpawn(() => undefined),
      tempDir,
    });

    await expect(provider.invoke({ prompt: 'slow', timeoutMs: 5 })).rejects.toThrow('LLM provider timed out after 5ms');
    expect(fs.readdirSync(tempDir)).toHaveLength(0);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('OllamaProvider', () => {
  it('returns available when tags endpoint responds ok', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const provider = new OllamaProvider({ fetchFn });

    await expect(provider.available()).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('http://localhost:11434/api/tags');
  });

  it('posts generate requests and returns the response field', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ response: ' hello\n' }), { status: 200 }));
    const provider = new OllamaProvider({ fetchFn });

    const res = await provider.invoke({ prompt: 'Reply with hello', model: 'qwen2.5:7b' });

    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen2.5:7b', prompt: 'Reply with hello', stream: false }),
      }),
    );
    expect(res).toMatchObject({ provider: 'ollama', model: 'qwen2.5:7b', text: 'hello' });
  });

  it('aborts generate requests after timeoutMs', async () => {
    const fetchFn = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    const provider = new OllamaProvider({ fetchFn });

    await expect(provider.invoke({ prompt: 'slow', timeoutMs: 5 })).rejects.toThrow('LLM provider timed out after 5ms');
  });
});

describe('LlmService', () => {
  function provider(id: LlmProvider['id'], available: boolean): LlmProvider {
    return {
      id,
      available: vi.fn(async () => available),
      invoke: vi.fn(),
    };
  }

  it('combines provider availability into the expected record', async () => {
    const service = new LlmService({
      providers: [provider('claude', true), provider('codex', false), provider('ollama', true)],
    });

    await expect(service.availability(true)).resolves.toEqual({ claude: true, codex: false, ollama: true });
  });

  it('returns providers by id', () => {
    const claude = provider('claude', true);
    const service = new LlmService({ providers: [claude] });

    expect(service.get('claude')).toBe(claude);
    expect(() => service.get('codex')).toThrow('Unknown LLM provider: codex');
  });

  it('caches availability within the ttl', async () => {
    const claude = provider('claude', true);
    const service = new LlmService({ providers: [claude], availabilityTtlMs: 30_000 });

    await service.availability();
    await service.availability();

    expect(claude.available).toHaveBeenCalledTimes(1);
  });
});

describe('LLM health endpoint', () => {
  it('requires authentication', async () => {
    const db = createTestDb();
    seedUser(db);

    await request(createApp(db, { llmService: { availability: vi.fn(async () => ({ claude: true, codex: true, ollama: true })) } }))
      .get('/api/llm/health')
      .expect(401, { error: 'unauthorized' });
  });

  it('returns provider booleans for authenticated users', async () => {
    const db = createTestDb();
    seedUser(db);
    const cookie = `session=${createSession('jrom@silverjrom.app', db)}`;
    const app = createApp(db, {
      llmService: { availability: vi.fn(async () => ({ claude: true, codex: false, ollama: true })) },
    });

    await request(app)
      .get('/api/llm/health')
      .set('Cookie', cookie)
      .expect(200, { claude: true, codex: false, ollama: true });
  });
});
