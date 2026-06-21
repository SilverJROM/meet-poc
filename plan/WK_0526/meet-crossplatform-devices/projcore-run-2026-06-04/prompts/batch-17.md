Batch-17: Stop resource leaks across long/repeated calls (LEAK2/LEAK3/LEAK4/LEAK5)

Batch ID: batch-17
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B16 committed @ 4085b43). Commit B17 on top.
Read FIRST: north-star.md (universal goal + gates), findings.md (LEAK2 line 165, LEAK3 166, LEAK4 167, LEAK5 168).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT batch: after DONE projcore runs an independent 2nd validator before final accept). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM. Confirm/counter at PROPOSED.

## North-star tie-in
Universal + Zoom/Meet-grade = stays healthy across LONG calls and REPEATED join/leave/reconnect cycles on modest phones/PCs. Leaks that accumulate orphaned audio source nodes, duplicate per-peer CPU work, stray timers firing after teardown, and unbounded strong track refs degrade exactly the long-call / multi-party / flaky-network cases this run is hardening. Fix the leaks; do not change call behavior.

## THE FINDINGS (confirmed by 6-model fan-out; confirm, don't re-derive)
- **LEAK2 (MED)** — `frontend/src/app/services/recorder.service.ts` (`addStream`/`addPeerStream`, ~line 133 area): when a peer RECONNECTS (same clientId, new MediaStream), `addStream(clientId, stream)` sets a NEW `MediaStreamAudioSourceNode` into `sourceFor` WITHOUT disconnecting the previous node for that clientId. The orphaned source stays connected to the mix destination → stale/dead audio mixed + node leak across reconnects in a long recording. Fix: before adding a source for a key that already exists, disconnect + delete the prior one (or have addPeerStream/addStream dedupe via the existing removePeerStream path). Keep `sourceCount` accurate.
- **LEAK3 (MED)** — `frontend/src/app/services/active-speaker.service.ts` (analyser graph ~124, sampling loop ~204): per-peer analysis work is duplicated / not deduped, so a peer added more than once (or 3-5 parties) creates redundant AnalyserNodes + sampling, growing CPU on modest devices. Fix: ensure ONE analyser/source entry per peer key (dedupe on add — disconnect/replace the prior entry), and that the sampling loop iterates the deduped set. Do NOT change the active-speaker DETECTION semantics, only stop the duplication. Confirm entries are disconnected on peer removal.
- **LEAK4 (LOW)** — `frontend/src/app/services/sfu-client.service.ts` (~lines 160 & 182): the `setTimeout(() => this.subscribeRetryVersion.update(...), retry.backoffMs)` backoff timers are NOT tracked (unlike `subscribeStuckTimers`), so they are never cleared on teardown/disconnect and can fire after cleanup. Fix: track these backoff timers in a Set (or reuse the existing timer-tracking pattern) and clear them all in the existing cleanup/disconnect/teardown path. No retry-behavior change.
- **LEAK5 (LOW)** — `frontend/src/app/services/media.service.ts` (`registerDebugTracks`, ~line 582; many callers): the debug registry holds STRONG refs to every track ever acquired, so ended tracks can't be GC'd over a long session of device switches. Fix: store WeakRef (or prune ended tracks on register / cap the set / drop on track 'ended'), so the debug registry doesn't pin dead tracks. Debug-only; must not affect live track lifecycle.

## Required fix (acceptance)
1. LEAK2: re-adding a recorder source for an existing clientId disconnects the prior node first; no orphaned source after reconnect; sourceCount correct.
2. LEAK3: exactly one analyser entry per peer; re-add replaces (disconnects old); removal disconnects; detection behavior unchanged; no duplicate sampling.
3. LEAK4: all subscribe backoff timers tracked + cleared on teardown; none fire after cleanup.
4. LEAK5: debug track registry no longer pins ended tracks (WeakRef/prune/cap); live track behavior unchanged.
5. No regression: recording start/stop/upload + peer add/remove, active-speaker detection, subscribe-retry (B08) + subscribe-stuck recovery, transport-recovery (B11) timers untouched in behavior, media acquire/replace paths (B01-B04), camera/mic toggles.

## Scope guards (MANDATORY — bypass mode)
- B17 ONLY (LEAK2/3/4/5). Touch: recorder.service.ts, active-speaker.service.ts, sfu-client.service.ts (ONLY the untracked backoff-timer tracking/clearing — do NOT touch planSubscribeRetry decision logic, the transport-recovery state machine, or register/subscribe flows), media.service.ts (registerDebugTracks only). Plus tests.
- Do NOT touch: B06 register, B08 planSubscribeRetry decision, B11 transport-recovery state machine, B15 signaling, B16 ice-config, media acquisition ladder logic.
- Prefer PURE/isolated, testable seams where possible (e.g. a dedupe helper, a timer-registry). Robust assertions — assert the OUTCOME (no orphaned node / timer cleared / weakref pruned), not just that a function ran.

## Deterministic proof
- Unit specs (npx tsx): LEAK2 — re-add same clientId disconnects prior + sourceCount stable; LEAK3 — re-add dedupes analyser entries (count stays 1/peer) + removal disconnects; LEAK4 — backoff timers tracked + cleared on teardown (assert the tracked set empties / clearTimeout called); LEAK5 — registry prunes/weakrefs ended tracks.
- Re-run existing specs (recorder*, active-speaker*, sfu-roster-utils, remote-audio*, media-acquisition). `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST in changes.md: note which leaks are proven by unit assertion vs reasoned; long-session real memory/CPU profiling is JROM's seat (not claimed proven by e2e).

## Plan handshake (MANDATORY)
1. Read brief + findings + the 4 source sites (recorder addStream/addPeerStream/removePeerStream; active-speaker analyser graph + loop; sfu-client backoff timers vs subscribeStuckTimers; media.service registerDebugTracks).
2. Reply PROPOSED: per-leak fix design, the dedupe/timer-registry/weakref approach, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. (3-agent: do NOT commit until projcore's independent 2nd validator returns SOLID — projcore handles the commit.)

## Artifacts (under <run-dir>/validation/B17/)
scenarios.md, changes.md (Root Cause per leak + per-file WHY + honest proof note), review.md, test-report.md, independent-validation.md. decisions/ entry for the dedupe/timer/weakref strategies.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-17 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
