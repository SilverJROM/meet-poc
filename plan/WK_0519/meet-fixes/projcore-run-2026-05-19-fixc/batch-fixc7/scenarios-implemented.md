# FIXC7 Scenarios Implemented

| Scenario | Coverage |
| --- | --- |
| FIXC7.1 settings lists providers + question library | Playwright asserts three providers and seeded questions. |
| FIXC7.2 star sets default provider | Playwright sets Codex default and verifies API persistence. |
| FIXC7.3 create question | Playwright creates a question with auto-run and provider override. |
| FIXC7.4 edit + delete question | Playwright edits, stars, and deletes the created question. |
| FIXC7.5 manual Run on transcript shows result | Playwright opens a seeded transcript, clicks Run, and sees the result. |
| FIXC7.6 auto-run sidecar persists across reload | Playwright verifies sidecar analysis display and reload persistence. |

Backend scenarios cover auth requirements, owner isolation, invalid providers, seeded defaults, settings persistence, manual analysis sidecar writes, missing/non-owned recordings, auto-run execution, and recording-delete cascade.
