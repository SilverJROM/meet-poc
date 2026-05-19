# 2026-05-19 — FIXC discussion-phase alignment

## Source

Codex `lkcdx-meet-v4` discussion-phase output (4m 07s), full transcript captured in the projcore /lead-mirror folder.

## Decisions resolved by projcore (minor implementation alignment, no JROM escalation needed)

### D1. Codex CLI model ID

- **Locked in spec (pre-discussion):** `codex exec --model spark`
- **Smoke result:** rejected — `The 'spark' model is not supported when using Codex with a ChatGPT account.`
- **Codex's corrected smoke:** `codex exec --model gpt-5.3-codex-spark "Reply with exactly: hello"` → `hello` ✅
- **Decision:** Use the full model ID `gpt-5.3-codex-spark` in FIXC5. JROM's intent was clearly the Spark variant; the literal alias is a CLI-API mismatch on the ChatGPT account, not a product change.
- **Surfaced to JROM:** yes, in run-status report.

### D2. Ollama benchmark candidate set

- **Pre-discussion starter list (5):** llama3.1:8b, qwen2.5:14b-instruct, mistral-nemo:12b, phi3:medium, gemma2:9b — all 5 require pull (~33 GB new).
- **Already-installed locally:** gpt-oss:20b, phi4:14b, qwen2.5:7b, qwen3.5:9b, llama3.2:3b, qwen2.5-coder:7b.
- **Codex's curated set (5, ~43.6 GB total, ~21.5 GB new pulls):**
  - qwen2.5:14b-instruct (pull ~9 GB)
  - mistral-nemo:12b (pull ~7.1 GB)
  - phi4:14b (already installed, 9.1 GB) — substituted for phi3:medium (newer, no pull cost)
  - gpt-oss:20b (already installed, 13 GB) — adds an OSS-22B-class baseline
  - gemma2:9b (pull ~5.4 GB)
- **Decision:** Accept codex's curated set. Falls under the ~50 GB constraint.

### D3. `/join/:id` route alias

- **Spec verification text:** `/join/<room>`
- **Current app routing:** `/room/:id`
- **Decision:** Add `/join/:id` as an alias to `RoomPage` in `app.routes.ts` (FIXC2 batch). Easier than rewriting all internal links. No requirement change.

## Spec disagreements requiring JROM escalation

None. All disagreements were minor implementation alignment, resolved per /projcore §1.12.

## Per-batch outline (codex-proposed, projcore-accepted)

| Batch | Files touched (codex's plan) | Approach (1-line) | Est. commits |
|---|---|---|---|
| FIXC1 | media.service, room.page, webrtc.service, new e2e spec | idempotent local-track stop on leave + pagehide/beforeunload cleanup | 1 |
| FIXC2 | new device-dialog component, media/webrtc/room/controls-bar, app.routes alias, new e2e | AudioContext+AnalyserNode VU, 440 Hz OscillatorNode beep, replaceTrack hot-swap | 2 |
| FIXC3 | room.page, tile, webrtc.service, ws.service, signaling/index.ts + tests, new e2e | new screen-flag in media-state signaling; vertical right strip sorted by activeFrame RMS + pulse + collapse | 2 |
| FIXC4 | recording/index.ts + tests, recordings.service, transcripts.page, new e2e | server-side `GET /transcript.txt` + `DELETE /transcript` | 1 |
| FIXC5 | new backend/src/modules/llm/, server.ts, tests | child_process for Claude/Codex, HTTP for Ollama, 60s timeout, --output-last-message for Codex | 2 |
| FIXC6 | decisions doc, backend/scripts benchmark runner, fixture gold summary | pull qwen2.5:14b + mistral-nemo:12b + gemma2:9b, run summarize/action-items, score accuracy first / speed second | 1 |
| FIXC7 | new migration, new questions module, recording/index.ts, settings page + transcripts page, tests + e2e | SQLite CRUD, settings UI with star-default, auto-run from transcribe child-close, sequential per transcript | 3 |
| FIXC8 | transcribe.py, recording/index.ts, settings route, settings UI, tests, e2e | dropdown small/medium/large-v3, config feeds spawn env, sidecar reports model | 2 |

**Total: ~14 commits across 8 batches.**

## Acceptance for discussion phase

Projcore accepts codex's per-batch outline. FIXC1 cleared to dispatch after JROM acknowledgment.
