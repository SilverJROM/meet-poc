# B0 Co-Planner Packet — Recovery-Ladder Strategy (cross-runtime review)

You are the **codex55 cross-runtime co-planner** for a projcore run. The coordinator is Opus;
you are the independent opposite-runtime planning seat. This is a PLAN/APPROACH review — you
do NOT write production code. Read the repo, pressure-test the plan, settle the approach.

## The problem (real)
Two live calls failed "connected but cannot hear each other": `JROMRoom` (2-way w/ Peer2),
`HRIS_TOJ` (5-way, moved to Google Meet). Backend admitted users, WebSockets stayed live, but
SFU media subscriptions did not converge. `/api/sfu/tracks` returned `406` in both. Some clients
sat at `advertised-not-subscribed`; some were `subscribed` but with audioLevel:0 + huge
concealedSamples; one client (Glory) had `hasPc:false` / never published.

## Grounding (read these)
- Requirements: `plan/WK_0701/projcore-run-2026-07-01/og-requirements.md` (R1–R6).
- Plan: `plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md` (B0–B9).
- The existing self-heal ladder ALREADY exists — key files:
  - `frontend/src/app/services/sfu-client.service.ts` — subscribe/retry/renegotiate/rejoin;
    **the give-up is at ~line 258**: after N attempts it logs "subscribe permanently stopped …
    guard stays set until cfSessionId changes" and never retries again.
  - `frontend/src/app/services/sfu-roster-utils.ts` — `planSubscribeRetry` (the cap).
  - `frontend/src/app/services/remote-audio.service.ts` — `VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW`,
    stall decision.
  - `frontend/src/app/pages/room/room-decisions.ts` — `decideRemoteVoiceWatchdogAction`.
  - `backend/src/modules/realtime-sfu/index.ts` — `/sfu/tracks|update|renegotiate|close` are thin
    CF passthroughs; the 406 originates at Cloudflare and is passed straight through (line ~134).
- Prior-art (a partial attempt already tried, uncommitted, preserved):
  `plan/WK_0701/projcore-run-2026-07-01/prior-art/uncommitted-resubscribe-attempt.patch`
  — adds `resubscribePublisher()` + a `resubscribe` watchdog action + `publisherMicEnabled`
  guard, but STILL gives up (caps → mark-stalled) and does a same-cfSessionId resubscribe.

## Locked direction (JROM, do not relitigate)
The permanent-stop cap must **escalate retry → renegotiate → full SFU rejoin (fresh cfSessionId)**
while the user is admitted and the publisher still advertises audio — never terminal give-up.
Silent failure is unacceptable.

## Settle these (this is the deliverable)
1. **Escalation ladder mechanism.** Exact order and trigger conditions for retry → renegotiate →
   full SFU rejoin. When precisely do we abandon same-session recovery and spin a FRESH
   cfSessionId? What bounds each rung so we don't get retry storms? What's the backoff shape?
2. **What "full SFU rejoin" concretely means here** given the CF session/track model in
   `realtime-sfu` + `sfu-client.service.ts`: new session creation, re-publish local tracks,
   re-subscribe all advertised remotes — and how to do it WITHOUT (a) duplicate subscriptions,
   (b) ghost/orphan remote streams, (c) clobbering unrelated healthy remote streams.
3. **The 406.** What does CF Calls `/tracks/new` 406 most plausibly mean here (stale session /
   renegotiation race / closed track / bad SDP)? Does the recovery differ by cause, or is a
   single escalation ladder sufficient? Flag any investigation B1 must do.
4. **Prior-art disposition.** Salvage ideas from the patch (the mic-enabled healthy-silence
   guard looks reusable) or discard? Be specific about what to keep.
5. **Plan review.** Are B1–B9 correctly ordered/atomic? Any missing failure mode? Confirm or
   adjust the [DELIB]/[REDTEAM] assignments (currently: DELIB on B0+B2; REDTEAM elite B2,
   standard B3+B6).

## Output (REQUIRED)
Write your verdict to:
`plan/WK_0701/projcore-run-2026-07-01/deliberation/B0-recovery-ladder/codex55-verdict.md`
End the file with a line: `STATUS: PROPOSED` (your recommended approach) — Opus will review and
either APPROVE or push back once. Keep it decision-dense: the escalation ladder spec, the rejoin
mechanism, the 406 read, prior-art keep/drop, and any plan adjustments. No production code edits.
