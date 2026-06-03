Batch-2: Self-healing per-party voice-playout watchdog (R2)

Batch ID: batch-2
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-host-audio-recovery/projcore-run-2026-06-03
Branch: CONTINUE feat/host-audio-recovery-20260603 (B1 committed @ adfebb9). Commit B2 on top.
Read FIRST: north-star.md (NS6 + WEB RESEARCH), og-requirements.md (R2), context-handoff.md.
You are CODEX, TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): HIGH (runtime watchdog + recovery ladder + backoff). Confirm/counter at PROPOSED.

## JROM directive (verbatim — the durable fix)
> "why cant there be a check if something is wrong and dynamically adjust, the primary one is the voice, all parties should have atleast a monitor if the voice is being played on each device and if its not then something is wrong and needs to restart or adjust something"

## Goal
B1 fixed the known Chrome root causes (kickstart #121673 + auto-resume/keepalive). B2 adds the DURABLE safety net: on EVERY device (host AND guests), continuously monitor whether each remote participant's voice is ACTUALLY being played, and auto-recover when it isn't — catching the known causes AND any future/unknown one, because it watches the OUTCOME.

## Required (R2 acceptance — see og-requirements.md)
1. **Watchdog poller:** sample each remote audio inbound track every ~1-2s, tracking bytesReceived + jitterBufferEmittedCount over a small rolling window. (Reuse the existing SFU getStats / inbound-track plumbing the diagnostics already use — do NOT add a new stats pipeline.)
2. **Detect RECEIVING-BUT-SILENT:** bytesReceived strictly increasing while jitterBufferEmittedCount stays flat (Δ≈0) over N consecutive samples (the exact 45197347 signature). Name N + thresholds as justified constants. Must NOT false-fire on a legitimately silent speaker (bytes not climbing) or a muted-all state.
3. **Auto recovery ladder (no user action), escalating until emitted climbs again:** (a) resume AudioContext, (b) ensure the B1 kickstart muted <audio> for that stream is attached + playing (re-create if missing), (c) re-play the mixer output element, (d) rebuild the mixer source for that peer (remove+re-add). Apply one step, wait a sample window, check if emitted resumed; only escalate if still stuck. Log each remediation (console + a counter in debugSnapshot).
4. **Backoff / no thrash:** once emitted resumes climbing, stop escalating and reset. Cap remediation attempts per peer per window so a genuinely-silent peer doesn't trigger an infinite loop. Silent (no-op) when healthy.
5. **All devices:** runs for host and guests alike (it lives in the shared remote-audio path, not gated to host).
6. **No regression:** common-case playout, volume/mute-all (a muted-all state must NOT be seen as "silent failure"), B1 kickstart/resume, the B2-prior limiter, mic-persistence, camera.

## Scope guards (MANDATORY — bypass mode)
- B2 ONLY (R2). Touch: frontend/src/app/services/remote-audio.service.ts (or a small new watchdog helper it owns) + room.page.ts (start/stop the watchdog on call lifecycle, feed it the inbound stats it already polls). Plus tests.
- Do NOT touch: SFU subscribe/transport internals, capture, diagnostics schema, layout, device picker, mic-join-gate, B1's kickstart/resume logic (CALL it from the ladder, don't rewrite it).
- Prefer a PURE, unit-testable detector function: `decideVoiceRecovery({samples:[{bytes,emitted}], attemptsThisWindow, mutedAll}) -> 'none'|'resume'|'kickstart'|'replay'|'rebuild'`. Wire it to the live poller.
- Robust polled assertions — assert the OUTCOME, never just that a function fired.

## Deterministic proof
- Unit spec (npx tsx) over the pure detector: receiving-but-flat ⇒ escalates; bytes-flat (real silence) ⇒ none; mutedAll ⇒ none; emitted-resumed ⇒ none/reset; attempt-cap respected.
- Integration/e2e if feasible: force the silent-but-receiving state (reuse B1's __suspendForTest / inject hooks) and assert the ladder drives contextState→running / emitted→climbing without user action.
- Re-run remote-audio-playability, remote-audio-health, feedback-limiter, B1 host-audio specs (no regression). build `npx ng build`; deploy DEV `pm2 restart meet-poc-fe`.

## Plan handshake (MANDATORY)
1. Read brief + B1's remote-audio.service.ts (kickstart/resume/ensureGraph/debugSnapshot) + how room.page polls inbound stats (the diagnostics path).
2. Reply PROPOSED: detector design + constants, the poller wiring (reusing existing getStats), the ladder + backoff, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B2/)
scenarios.md, changes.md (Root Cause/strategy + per-file WHY), review.md, test-report.md, screenshots/ (if applicable), independent-validation.md. decisions/ entry for detector thresholds + ladder.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-2 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
