---
date: 2026-05-28
type: investigation
status: reviewed
agent: projcore
qa_verification: log + DB forensic review of all 2026-05-28 calls
---

# Review: were yesterday's call drops legit logouts or app failures?

**JROM verbatim:**
> "on some of my calls yesterday there were times that the users were being logged out and needs to reconnect, can you review those if those are legit logout or a fail on the app that they dropped and was not re-addmitted, check all calls yesterday"

## Method
- `meeting_sessions` + `meeting_session_diagnostics` (SQLite) for 2026-05-28.
- Backend signaling log `logs/meet-poc-be-out.log` — RECONNECTING / EXPIRED / `+ RESUME` / `+ OWNER` / ADMITTED / KNOCK per room.
- Separated real calls (room `180cce4e7f73` "JROM Test", host jrom@silverjrom.app) from noise: 134 backend restarts (tsx file-watch during dev) + Playwright E2E test rooms with fixture users (WatchdogGuest/Peer1-3/BannerGuest/AdmitAllTwo).

## Findings
- **No permanent drops / lockouts in real calls.** Room `180cce4e7f73`: **EXPIRED = 0**. Every disconnect recovered.
- **Legit brief reconnects (recovered):** e.g. Jtest 13:36:29 RECONNECTING → 13:37:10 `+ RESUME` (41s); Yes 13:45:37 → 13:45:57 (20s). Normal network blips, grace-resume worked as designed.
- **One real app failure — a resume/supersede loop:** participant "Caily" produced **479 `+ RESUME` events, 463 of them in 13:51–13:59** (~1/sec; 66 distinct WebSocket clientIds in a single minute), during the 13:34–13:59 call (peak 4). `admitted` held at 3 the whole time (Caily stayed "in", but their socket churned ~1/sec for ~8 min — visible to others as constant reconnecting/flicker).

## Root cause
`readClientKey()` (frontend `room.page.ts:2529`) stores the durable identity in **`localStorage` (`meet-poc.clientKey`)**, shared across all tabs of one browser profile. `ws.service` auto-reconnects on any non-intentional close (`ws.service.ts:221`) with no "displaced-by-another-session" guard. Two live tabs/devices of the same room with the same key →
each new socket `canResumeByClientKey` → admitted as resume → **supersedes** the other socket → the displaced tab's `onclose` → `scheduleReconnect()` → reconnects with the same key → supersedes back → infinite ~1/sec loop (backoff never escalates because each reconnect "succeeds").

## Recommended fix (not yet implemented — review only)
1. **Per-tab identity:** store `clientKey` in `sessionStorage` instead of `localStorage` (per-tab; reload-in-same-tab still resumes, two tabs get distinct identities → no supersede war). Lowest-risk.
2. **Displaced guard (server+client):** when the server supersedes an admitted peer for the same clientKey, close the old socket with a dedicated code/reason ("opened-elsewhere"); client sets `intentionallyClosed` and shows "This room is open in another tab/device" instead of reconnecting. Breaks the loop even across devices.
- Best: do both. Offered to JROM.
