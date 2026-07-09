# B08S-1 — Evidence spine 1/2: dual-browser call driver

**Role:** implementer L2 (haiku)  
**§4b:** impl L2, val L2, delib no, redteam budget  
**Deps:** B03, B01 banked

## Why this batch exists (D29)
Recording is the arbiter but nothing produces a dual-browser receive-side recording yet. Every live AC is blocked without a call driver.

## Exact scope
Build a harness module (adapt legacy `e2e/scripts/` tooling — do not greenfield blindly) that:
1. Joins **two browsers** `.140` path (or single-host dual Chromium) into a **run-created room**
2. Drives B03 fixed-clock speech schedule
3. Books every attempt through B01 `CallLedger` (burn accounting, created room/session IDs)
4. Both publish audio

## Acceptance
- Two browsers join a run-created room, both publish
- Ledger records burn + created IDs
- **Closes no AC** — only unblocks live path
- Prefer dry-run/smoke that proves join+publish without burning full 3–5 min if possible; if a real join is needed, burn honestly (1/25) and log IDs for cleanup
- Never delete `652c1475` / `TEST_ROOM01`

## Out of scope
Receive-side WAV capture + transcript (B08S-2). AC assertions. App product fixes.

## Handshake
PROPOSED first → wait APPROVED-PLAN.  
Callback: `[projcore callback] impl B08S-1 STATUS: …`
On DONE: commit + validation/b08s1-changes.md
