Batch-21b: Race/handler hardening — watchdog re-read, listener add/remove, enabled guard, sink serialize (TINY2/TINY4/TINY6/ERR9)

Batch ID: batch-21b
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B21a committed @ 066c220). Do NOT commit (projcore validates + commits).
Read FIRST: north-star.md, findings.md (TINY2 line 145, TINY4 line 147, TINY6 line 149, ERR9 line 140).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): LOW-MEDIUM. Confirm/counter at PROPOSED.

## projcore already re-verified these are STILL OPEN (audited current sites below; confirm, don't re-derive). Siblings TINY5/TINY7/ERR8 were found ALREADY-FIXED — NOT in scope.

## North-star tie-in
Stability under churn: rapid mic toggles, repeated track failures, and simultaneous multi-peer joins must not leave stale handlers, false watchdog reads, or racing setSinkId calls. Four small concurrency/handler-hygiene bugs.

## THE FINDINGS (confirmed OPEN by audit; current sites)
- **TINY2 (stale-read in mic watchdog)** — `frontend/src/app/pages/room/room.page.ts` ~line 3172: `micActive`/`captureTrackLive()` is read at ~3172, then `await this.sfuClient.getOutboundAudioSource()` at ~3183, and the earlier-read liveness is used AFTER the await without re-checking — so a track that ended DURING the await is treated as live. Fix: re-read `captureTrackLive()` (and any other liveness/track state it depends on) AFTER the await, before acting on it.
- **TINY4 (handler leak on re-attach)** — room.page.ts ~line 2763 `attachLocalTrackFailureHandlers`: assigns `track.onended`/`onmute`/`onunmute` via PROPERTY assignment. It's called more than once (e.g. lobby ~1878 then ~1908), and property-assignment re-attach doesn't remove the prior handler binding cleanly across different track objects / repeated calls — risk of duplicate handlers firing / stale closures. Fix: use `addEventListener` with STORED handler refs and `removeEventListener` the prior ones before re-attaching (a small detach() that the next attach calls first), so a double-call never leaves duplicate live handlers. Keep the existing failure behavior identical — only fix the attach/detach hygiene.
- **TINY6 (missing enabled guard)** — room.page.ts ~line 2778 `handleLocalTrackFailure`: the guard (~2779) checks call state + current-track identity but not `track.enabled`; the 'ended' branch (~2790) can trigger recovery even for a track the user deliberately DISABLED (mic off). Fix: include a `track.enabled` (or our own micOn/cameraOn intent) check so a deliberately-disabled track ending does NOT trigger an unwanted recovery. Don't suppress genuine failures of an ENABLED track.
- **ERR9 (concurrent setSinkId race)** — `frontend/src/app/services/remote-audio.service.ts` ~line 421: `addSource` fires `recoverPlayback()` un-serialized, and `applyOutputDevice`/`applySinkId` is also invoked in a parallel `Promise.all` — on simultaneous multi-peer joins, concurrent `setSinkId` calls on overlapping elements can race. Fix: serialize/debounce the sink-application so setSinkId calls don't overlap (a small per-service queue/in-flight guard, or coalesce to the latest desired sink). Reuse the B13 per-element setSinkId fallback (don't rewrite it) — just prevent the concurrent overlap. No change to the chosen-output behavior.

## Required fix (acceptance)
1. TINY2: liveness re-checked after the await; an ended-during-await track is not treated as live.
2. TINY4: re-attaching failure handlers never leaves duplicate/stale handlers; detach-before-attach via addEventListener/removeEventListener with stored refs.
3. TINY6: a deliberately-disabled track ending does not trigger recovery; an enabled track's genuine failure still does.
4. ERR9: concurrent setSinkId calls are serialized/coalesced (no overlapping setSinkId); chosen output still applied; B13 fallback intact.
5. No regression: mic silence watchdog (B2/B14), local-track failure recovery, remote-audio playout + B13 sink fallback + B17 leak fixes, multi-peer join playout.

## Scope guards (MANDATORY — bypass mode)
- B21b ONLY (TINY2/4/6/ERR9). Touch: room.page.ts (TINY2 re-read, TINY4 attach/detach, TINY6 guard), remote-audio.service.ts (ERR9 serialize sink). Plus tests.
- Do NOT touch: SFU subscribe/transport, signaling, recorder, media acquisition, the device picker, ERR8/TINY5/TINY7 (already fixed), B13 setSinkId fallback internals (call/wrap, don't rewrite).
- Prefer pure/testable seams (e.g. a small sink-serialize queue; a pure should-recover decision incorporating enabled). Robust assertions — assert the OUTCOME.

## Deterministic proof
- Unit specs (npx tsx): TINY6 should-recover decision (disabled-track-ended→no; enabled-track-ended→yes); ERR9 sink-serialize (overlapping requests run one-at-a-time / coalesce to latest, assert no concurrent in-flight); TINY4 detach-before-attach (a stored-ref detach removes the prior listener) if unit-reachable, else reasoned + ng build; TINY2 a small helper or reasoned note (re-read after await).
- Re-run remote-audio-* specs, media-toggle, recorder-leaks, active-speaker-leaks (no regression). `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST about unit-proven vs reasoned (TINY2/TINY4 may be partly reasoned + build).

## Plan handshake (MANDATORY)
1. Read brief + the 4 sites (room.page.ts ~3172/~2763/~2778 + the ~1878/~1908 attach callers; remote-audio.service.ts ~421 addSource/recoverPlayback/applyOutputDevice).
2. Reply PROPOSED: TINY2 re-read, TINY4 detach/attach design, TINY6 guard, ERR9 serialize design, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit.

## Artifacts (under <run-dir>/validation/B21b/)
scenarios.md, changes.md (Root Cause per finding + per-file WHY + honest note), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-21b <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
