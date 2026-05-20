# Batch FIXC5 Scenarios Implemented

## R-C-8 LLM Provider Abstraction
- Claude provider supports `claude -p --model sonnet "<prompt>"` by default and allows per-request model override.
- Codex provider supports `codex exec --output-last-message <tempfile> --model gpt-5.3-codex-spark "<prompt>"` by default and returns the final message file contents.
- Ollama provider supports HTTP POST to `http://localhost:11434/api/generate` with `{ model, prompt, stream: false }`.
- All provider invocations use a 60s default timeout, configurable through `LlmRequest.timeoutMs`.
- CLI provider timeouts terminate processes with SIGTERM, followed by SIGKILL after a grace period.
- Ollama provider timeouts abort the HTTP request.
- Provider availability is checked through `which claude`, `which codex`, and Ollama `/api/tags`.
- Availability is cached for 30s and logged at backend boot.
- Authenticated `GET /api/llm/health` exposes `{ claude, codex, ollama }` and always returns HTTP 200.

## Explicit Non-Scope Held
- No settings UI for default provider.
- No transcript cleanup action.
- No Ollama model pull or benchmark.
- No cost tracking.
