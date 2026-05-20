# Run C — Requirements Matrix

Status legend: `OPEN` / `IN_BATCH` / `IMPLEMENTED` / `VERIFIED`

| # | Requirement (1-line) | Batch | Status | Evidence |
|---|---|---|---|---|
| R-C-1 | Pre-join device test modal (cam preview + mic VU + speaker test + dropdowns + custom permission overlay) | FIXC2 | **VERIFIED** | batch-fixc2/independent-validation.md — 650ms auto-start nuance flagged |
| R-C-2 | In-call device dialog from gear icon — hot-swap mid-call | FIXC2 | **VERIFIED** | batch-fixc2/independent-validation.md — FIXC2.4 PASS |
| R-C-3 | Camera-light fix — `.stop()` every local track on leave | FIXC1 | **VERIFIED** | batch-fixc1/independent-validation.md — backend 59/59, e2e 4/4, R1 49/49 |
| R-C-4 | Screen-share reflow — right strip, scroll, speaker-float + pulse, collapsible | FIXC3 | **VERIFIED** | batch-fixc3/independent-validation.md — single-sender caveat noted |
| R-C-5 | Transcript download as subtitle-style `.txt` | FIXC4 | **VERIFIED** | batch-fixc4/independent-validation.md — FIXC4.1 PASS |
| R-C-6 | Transcript delete independent of audio | FIXC4 | **VERIFIED** | batch-fixc4/independent-validation.md — FIXC4.2/4.3 PASS |
| R-C-7 | Past-meetings delete = rooms-bulk-delete (no new UI) | FIXC4 | **VERIFIED** | existing rooms-bulk-delete coverage in backend suite |
| R-C-8 | LLM provider abstraction (Claude sonnet / Codex spark / Ollama) | FIXC5 | **VERIFIED** | batch-fixc5/independent-validation.md — live /api/llm/health returns all-true |
| R-C-9 | Settings UI for LLM default (star to set) | FIXC7 | **VERIFIED** | validation/batch-fixc7.md — FIXC7.1/7.2 PASS + screenshot shows starred Ollama default |
| R-C-10 | Ollama benchmark — top 3 by accuracy then speed | FIXC6 | **VERIFIED** | decisions/2026-05-19-fixc-ollama-benchmark.md — top 3: mistral-nemo:12b / gpt-oss:20b / gemma2:9b |
| R-C-11 | Question library CRUD | FIXC7 | **VERIFIED** | validation/batch-fixc7.md — FIXC7.3 create/edit/star/delete PASS + backend CRUD tests |
| R-C-12 | Question execution — auto on transcript-ready + manual Run button | FIXC7 | **VERIFIED** | validation/batch-fixc7.md — FIXC7.4/7.5/7.6 PASS + sidecar persistence |
| R-C-13 | Transcriber model dropdown (small/medium/large-v3) | FIXC8 | **VERIFIED** | validation/batch-fixc8.md — FIXC8.1/8.2/8.3 PASS, sidecar-model chain proven, R1 67/67 |

Final acceptance: every row = VERIFIED. ✅ **ALL 13 REQUIREMENTS VERIFIED (2026-05-20).**
