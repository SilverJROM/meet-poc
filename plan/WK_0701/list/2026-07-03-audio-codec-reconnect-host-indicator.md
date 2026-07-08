# Audio codec/bitrate hardening + reconnect resilience + host silent-participant indicator

- **Type:** bug/enhancement (3 related findings from one incident diagnosis)
- **Status:** LOGGED, NOT STARTED (R2/R3/R4) — `projcore-run-2026-07-03` PAUSED 2026-07-04
  (token budget, JROM) before any deliberation/implementation began. See run's `context-handoff.md`.
- **Raised:** 2026-07-03 (diagnosis) · confirmed for the punch list by JROM 2026-07-03 · **Handler:** projcore

## Source
Diagnosed from live session data (SQLite `meeting_session_diagnostics`) for room "ReceiptBOT",
2026-07-03 09:38-10:39 AM PH, cross-checked against `sfu-client.service.ts` / `room.page.ts`.
JROM confirmed all three for the punch list when asked to list everything before starting.

## Findings -> requirements
- **R2 — no audio codec/bitrate hardening.** Video has explicit bitrate tiers; audio has none
  (no Opus floor, no DTX control, no RED/FEC). Left at browser defaults.
- **R3 — reconnect churn.** Participant "Farida Corpuz" (iOS Safari) churned through 6 distinct
  client sessions with 2 WebSocket disconnects (code 1006) in one ~61min call.
- **R4 — no host-facing visibility.** Host had no indicator that `acctg` was silent-at-source
  for most of the call, or that other participants were mid-reconnect.

## qa_verification
pending — R2/R3/R4 acceptance criteria in `projcore-run-2026-07-03/og-requirements.md`.
