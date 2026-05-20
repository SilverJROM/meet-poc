# Batch FIXC5 — LLM provider abstraction (Claude / Codex / Ollama)

**Persona:** Codex builder, `-s danger-full-access`. FIXC1-4 PASSED. R8.1 holds 14 consecutive batches. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirement R-C-8

JROM verbatim:
> "on the setup lets have a configurable way to plug in an LLM to cleanup a transcript have an option to use claude/codex (headless) or one of the better ollama models (test this out)."
> "for codex add spark, and for claude use sonnet"

Spec row:
- **R-C-8** Backend `LLMService` with three implementations:
  - **`claude-cli`** → `claude -p --model sonnet "<prompt>"`
  - **`codex-cli`** → `codex exec --model gpt-5.3-codex-spark "<prompt>"` (full model ID per discussion-phase smoke; the literal alias `spark` is rejected on this ChatGPT account)
  - **`ollama`** → HTTP POST `http://localhost:11434/api/generate`, body `{"model":"<model>","prompt":"<text>","stream":false}`
- Per-provider availability check at boot, logged + exposed via health endpoint
- Tests cover each provider via mocking + at least one real smoke

## Branch

```
git checkout -b fix/meet-fixc5-llm-providers fix/meet-fixc4-transcript-tools
```

## Implementation (your discussion-phase plan)

> Files: new backend/src/modules/llm/*, backend/src/server.ts, backend tests.
> Approach: child_process for Claude/Codex, HTTP for Ollama, 60s timeout per execution, boot availability checks only CLI/HTTP presence, health endpoint returns provider availability.
> Gotcha: Codex CLI emits logs; service should capture final output robustly, preferably with --output-last-message temp file.
> Tests: mocked provider invocations, timeout, health endpoint.
> Commits: 2.

### Module layout

`backend/src/modules/llm/`
- `types.ts` — shared types:
  ```ts
  export type LlmProviderId = 'claude' | 'codex' | 'ollama';
  export interface LlmRequest { prompt: string; model?: string; timeoutMs?: number; }
  export interface LlmResponse { text: string; provider: LlmProviderId; model: string; latencyMs: number; }
  export interface LlmProvider {
    readonly id: LlmProviderId;
    available(): Promise<boolean>;
    invoke(req: LlmRequest): Promise<LlmResponse>;
  }
  ```
- `claude-provider.ts` — `claude -p --model <model> "<prompt>"`. Default model = `sonnet`. Uses `child_process.spawn` (not `exec`) so we can stream stdin if we ever need to pipe transcripts > shell arg limit; for now write prompt as final positional arg. Capture stdout, return as `text`.
- `codex-provider.ts` — uses `codex exec --output-last-message <tempfile> --model <model> "<prompt>"`. Default model = `gpt-5.3-codex-spark`. The `--output-last-message` flag writes only the final assistant response to the tempfile, sidestepping the verbose logs in stdout. Read the file after spawn closes, unlink it, return contents as `text`.
- `ollama-provider.ts` — `fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({model, prompt, stream: false}) })`. Default model: leave configurable, but for the boot availability check use `qwen2.5:7b` since it's already installed. Pull the `response` field from the JSON.
- `index.ts` — exports a `LlmService` class that holds a Map<id, provider>, exposes `get(id)`, `availability()` returning `Record<LlmProviderId, boolean>`. Construction wires the three providers.
- `availability-check.ts` — at server boot, asynchronously calls `available()` on each provider and logs to PM2:
  - Claude: `which claude` returns 0 → available
  - Codex: `which codex` returns 0 → available
  - Ollama: HTTP GET `http://localhost:11434/api/tags` returns 200 → available
  - Cache the result for 30 s.

### Timeout

All `invoke()` calls share a 60 s default ceiling. Configurable via `LlmRequest.timeoutMs`. Use `AbortController` for fetch (Ollama). For spawn (Claude/Codex), use a `setTimeout` that calls `child.kill('SIGTERM')` then `SIGKILL` after a 5 s grace. On timeout, throw `Error('LLM provider timed out after Nms')`.

### Health endpoint

`GET /api/llm/health` → auth required, returns:
```json
{ "claude": true, "codex": true, "ollama": true }
```
Backed by the cached availability check. 200 always (returns the state); never throws.

### Server wiring

`backend/src/server.ts` — instantiate `LlmService` once at boot. Register `/api/llm/health` route. Export the service from a module-level singleton or DI container (whichever matches existing patterns).

### Tests (`backend/tests/llm-providers.test.ts` or split)

Use mocking. **Do NOT call the real CLI or Ollama from tests** — that's slow + flaky. Mock `child_process.spawn` and global `fetch`.

1. **`claude-provider.test.ts`**
   - `available()` returns true when `which claude` exits 0
   - `available()` returns false when `which claude` exits 1
   - `invoke({prompt: 'x', model: 'sonnet'})` spawns `claude -p --model sonnet x`, captures stdout, returns the text
   - `invoke()` rejects with timeout error if process exceeds `timeoutMs`
   - Default model is `sonnet` if not provided
2. **`codex-provider.test.ts`**
   - Spawns `codex exec --output-last-message <tmp> --model gpt-5.3-codex-spark <prompt>`
   - Reads + unlinks tempfile, returns contents
   - Default model is `gpt-5.3-codex-spark`
   - Timeout behavior matches Claude
3. **`ollama-provider.test.ts`**
   - `available()` true when `fetch('/api/tags')` returns 200
   - `invoke()` POSTs to `/api/generate` with correct body, returns `response` field
   - Timeout behavior via `AbortSignal`
4. **`llm-service.test.ts`**
   - `availability()` returns the right combined record
   - `get(id)` returns the right provider
5. **`llm-health-endpoint.test.ts`**
   - Auth required (401 without)
   - Returns `{claude, codex, ollama}` object with bools
6. **Real smoke (kept in a separate test file, gated by env var `LLM_SMOKE=1`)** — runs against real Ollama only (free + local):
   - `invoke({prompt: 'Reply with exactly: hello', model: 'qwen2.5:7b'})` returns text containing `hello`
   - Gate: `if (!process.env.LLM_SMOKE) test.skip()`

### Things explicitly NOT in this batch

- DO NOT add settings UI for default-provider star — that's FIXC7 (question library).
- DO NOT add LLM-on-transcript triggering — that's FIXC7.
- DO NOT add Ollama model pulls — that's FIXC6 (benchmark).
- DO NOT add cost tracking — out of scope.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc5/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `screenshots/` empty — no UI changes

## Build + deploy

- Backend build + tests PASS
- Frontend build PASS (no frontend changes; build still must pass)
- `pm2 restart meet-poc-be`
- Live smoke: `curl -s -b cookies.txt https://voice.silverjrom.app/api/llm/health` returns `{"claude": true, "codex": true, "ollama": true}` (after login)

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] `npm test -w backend` PASS — expect ≥75/75 (65 prior + ~10 new LLM tests)
- [ ] `LLM_SMOKE=1 npm test -w backend -- --runInBand llm-smoke` PASS for Ollama
- [ ] `curl -i -b cookies.txt https://voice.silverjrom.app/api/llm/health` returns 200 + all-true JSON
- [ ] Run 1 e2e regression PASS — must hold; this is R8.1's 15th consecutive batch

## Completion

End with the STATUS: DONE block. I'll validate independently before dispatching FIXC6.
