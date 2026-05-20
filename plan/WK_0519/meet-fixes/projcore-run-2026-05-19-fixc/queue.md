# Run C — Batch Queue

Status legend: `PENDING` / `IN_PROGRESS` / `VALIDATING` / `PASS` / `FAIL` / `BLOCKED`

| # | Batch | Branch | Status | Requirements covered |
|---|---|---|---|---|
| 0 | DISCUSSION | (no branch) | PASS | meta — align on plan before any build |
| 1 | FIXC1 — camera-light fix | `fix/meet-fixc1-camera-light` | **PASS** | R-C-3 |
| 2 | FIXC2 — device modal + in-call dialog | `fix/meet-fixc2-device-modal` | **PASS** | R-C-1, R-C-2 |
| 3 | FIXC3 — screen-share reflow | `fix/meet-fixc3-share-reflow` | **PASS** | R-C-4 |
| 4 | FIXC4 — transcript delete + .txt download | `fix/meet-fixc4-transcript-tools` | **PASS** | R-C-5, R-C-6, R-C-7 |
| 5 | FIXC5 — LLM provider abstraction | `fix/meet-fixc5-llm-providers` | **PASS** | R-C-8 |
| 6 | FIXC6 — Ollama benchmark | `fix/meet-fixc6-ollama-benchmark` | **PASS** | R-C-10 |
| 7 | FIXC7 — question library | `fix/meet-fixc7-question-library` | **PASS** | R-C-9, R-C-11, R-C-12 |
| 8 | FIXC8 — transcriber dropdown | `fix/meet-fixc8-transcriber-config` | **PASS** | R-C-13 |

Sequential dispatch — no concurrent batches in this codex session.
