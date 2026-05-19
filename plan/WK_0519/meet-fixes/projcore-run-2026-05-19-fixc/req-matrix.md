# Run C — Requirements Matrix

Status legend: `OPEN` / `IN_BATCH` / `IMPLEMENTED` / `VERIFIED`

| # | Requirement (1-line) | Batch | Status | Evidence |
|---|---|---|---|---|
| R-C-1 | Pre-join device test modal (cam preview + mic VU + speaker test + dropdowns + custom permission overlay) | FIXC2 | OPEN | — |
| R-C-2 | In-call device dialog from gear icon — hot-swap mid-call | FIXC2 | OPEN | — |
| R-C-3 | Camera-light fix — `.stop()` every local track on leave | FIXC1 | **VERIFIED** | batch-fixc1/independent-validation.md — backend 59/59, e2e 4/4, R1 49/49 |
| R-C-4 | Screen-share reflow — right strip, scroll, speaker-float + pulse, collapsible | FIXC3 | OPEN | — |
| R-C-5 | Transcript download as subtitle-style `.txt` | FIXC4 | OPEN | — |
| R-C-6 | Transcript delete independent of audio | FIXC4 | OPEN | — |
| R-C-7 | Past-meetings delete = rooms-bulk-delete (no new UI) | FIXC4 | OPEN | — |
| R-C-8 | LLM provider abstraction (Claude sonnet / Codex spark / Ollama) | FIXC5 | OPEN | — |
| R-C-9 | Settings UI for LLM default (star to set) | FIXC7 | OPEN | — |
| R-C-10 | Ollama benchmark — top 3 by accuracy then speed | FIXC6 | OPEN | — |
| R-C-11 | Question library CRUD | FIXC7 | OPEN | — |
| R-C-12 | Question execution — auto on transcript-ready + manual Run button | FIXC7 | OPEN | — |
| R-C-13 | Transcriber model dropdown (small/medium/large-v3) | FIXC8 | OPEN | — |

Final acceptance: every row = VERIFIED.
