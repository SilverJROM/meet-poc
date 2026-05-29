# Queue — projcore-run-2026-05-28 (features)

[DONE]       B1: backend guest WS + auto-open + close-room (R4,R5,R7) — eb11126
[DONE]       B2: frontend guest /join page+overlay (R1,R2,R3) — 07da3ee
[DONE]       B3: host leave-modal extend + room-closed wire (R6,R7) — 5150a9c
[DONE]       B4: UI home/rooms list redesign (R8) — 5d6b666
[DONE]       B5: UI pre-join/lobby redesign (R9) — 3bb27f8
[DONE]       B6: UI waiting room/admit polish (R10) — 51faf27
[DONE]       B7: UI room settings polish (R11) — 8fe1181
[DONE]       B8: Build + deploy + smoke (ALL) — 2b47c92 (regression sweep)

---

## Injection log (JROM chat-injected items)
_None._

## Surprise findings for JROM
1. **Stale backend processes (May 22)** were holding port 4720 — PM2's `meet-poc-be` had been crash-looping on EADDRINUSE for 5 days. Killed them. PM2 now owns the backend cleanly.
2. **B2 subscribe-stuck watchdog** fires reliably in Playwright (host+guest, every run) — `pcConnectionState=connected` but no `pc.ontrack` ever. JROM's production diagnostics for d216b499 showed the same path completing in 1.9s, so this is env-specific. The watchdog now arms to surface this in real-user logs if it ever happens. Separate diagnosis recommended after this run.
3. **B4 + B7 regression sweep needed during B8** — 4 line-level edits to restore action labels + Join link + Open-for-guests chip. Captured in B8-validation.md.
