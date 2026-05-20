# Batch FIXC5 Test Report

## Commands
- `npm run build -w backend`
  - Result: PASS
- `npm test -w backend`
  - Result: PASS
  - Count: 81 passed, 1 skipped
- `LLM_SMOKE=1 npm test -w backend -- llm-smoke`
  - Result: PASS
  - Count: 1 passed
  - Model: `qwen2.5:7b`
- `npm run build -w frontend`
  - Result: PASS
  - Note: existing Stencil empty-glob warning only
- `pm2 restart meet-poc-be`
  - Result: PASS
  - Status: online
- live authenticated health smoke
  - Result: PASS
  - Response: HTTP 200, `{"claude":true,"codex":true,"ollama":true}`
- Run 1 e2e regression
  - Command: `npm test -w e2e -- tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`
  - Result: PASS
  - Count: 58 passed

## Coverage Notes
- Mocked tests cover Claude CLI availability, Claude invocation args, Claude default model, and timeout cleanup.
- Mocked tests cover Codex tempfile output capture, Codex default model, and timeout cleanup.
- Mocked tests cover Ollama availability, generate request body, response parsing, and abort timeout.
- Service tests cover combined availability, provider lookup, and 30s cache reuse.
- Endpoint tests cover unauthenticated 401 and authenticated availability JSON.
