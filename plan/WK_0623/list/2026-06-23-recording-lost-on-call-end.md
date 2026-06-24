---
date: 2026-06-23
type: bug (real-call data loss — high severity)
status: diagnosed (read-only); fix gated behind JROM go
agent: projcore
qa_verification: pending
---

# Recording lost on call end (8s upload timeout + page-teardown abort)

## JROM verbatim
> "can you add as well a check or validation as i just got off the call, and i believed i hit record but the
> app didnt record the call, can you double check if there is an issue here. check this and give me a feedback
> before making adjustment on the app … or adding to the list"

## Disposition
Investigated read-only (2026-06-23). **Confirmed lost recording:** room a78ae0bd02b6 ("ReceiptBOT"), host
silverjrom, session 01:54→02:49 UTC; `recording-state` started 02:18 + stopped 02:49, but **zero `[rec] saved`**
→ no file. Root cause: finished-recording upload has an 8s timeout (`room.page.ts:1433`) a real (~25MB+)
recording can't meet; stopping-by-ending-the-call tears the page down ~1s later and aborts the in-flight
upload. Short test recordings (<8s) survive — synthetic-passes/real-fails. Per-user uploads (fire-and-forget)
lost the same way. Full design: `projcore-run-2026-06-23/decisions/2026-06-23-recording-upload-loss.md`,
req-matrix R5.1–R5.7, plan `B5-recording-reliability.md`. **JROM directive: feedback first, no hot-patch.**
Recommended priority: HIGH (silent data loss). No implementation until go.
