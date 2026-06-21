Batch-18: Fix recording — no silent mobile recordings, no lost reconnect audio (REC1/REC2/REC3)

Batch ID: batch-18
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B17 committed @ 243cd6f). Commit B18 on top — wait, do NOT commit (3-agent; projcore commits after independent validation).
Read FIRST: north-star.md (universal + Zoom/Meet goal), findings.md (REC1 line 200, REC2 line 201, REC3 line 202). NOTE: the finding line numbers are PRE-FIX; the real current sites are given below (projcore re-derived them post-B17).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT batch: projcore validation + independent 2nd validator before commit). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM. Confirm/counter at PROPOSED.

## North-star tie-in
Recording must Just Work like Zoom/Meet: a host who hits Record on a phone must get AUDIBLE audio (not a silent file), and every participant — including someone who dropped and reconnected — must be captured, with no stale/dead sources bloating the mix. These three are confirmed HIGH logic bugs.

## THE FINDINGS (confirmed by 6-model fan-out; current sites re-verified by projcore)
- **REC1 (HIGH) — silent recording on mobile.** `frontend/src/app/services/recorder.service.ts` `start()` (~line 85, ctx created ~line 94): the AudioContext is created but never resumed. On iOS/Android the AudioContext is born `suspended` (autoplay policy) → the MediaRecorder captures the mixer destination which produces NO audio → a SILENT recording. Fix: in `start()`, after creating the ctx (before `recorder.start()`), if `ctx.state === 'suspended'` `await ctx.resume()`. Make `start()` async if needed and update the single caller in room.page accordingly (await it). Recording is host-gesture-initiated, so resume() will succeed.
- **REC2 (HIGH) — dead eviction loop; dropped peers never evicted.** `frontend/src/app/pages/room/room.page.ts` the recorder-sync `effect()` at ~lines 693-702:
  ```
  const activePeerIds = new Set<string>();
  for (const peer of this.peers()) { if (peer.isLocal) continue; activePeerIds.add(peer.id); this.recorder.addPeerStream(peer.id, peer.stream); }
  for (const peer of this.peers()) { if (!peer.isLocal && !activePeerIds.has(peer.id)) this.recorder.removePeerStream(peer.id); }
  ```
  The removal loop iterates the SAME `this.peers()` used to build `activePeerIds`, so `!activePeerIds.has(peer.id)` is ALWAYS false — the loop is DEAD CODE and removes nothing. When a peer drops (leaves `peers()`), its recorder source is never evicted → stale/dead audio source persists in the recording mix. Fix: the removal must iterate the recorder's CURRENTLY-TRACKED source client ids (NOT the current peers). Add a small getter on RecorderService, e.g. `recordedClientIds(): string[]` returning `[...this.sourceFor.keys()]`, and change the effect to: `for (const id of this.recorder.recordedClientIds()) if (!activePeerIds.has(id)) this.recorder.removePeerStream(id);`. (This complements B17 LEAK2 which fixed the recorder's internal re-add dedupe; REC2 is the orchestration-level eviction-on-drop.)
- **REC3 (HIGH) — reconnected peer leaks old source + may not be re-captured.** `frontend/src/app/pages/room/room.page.ts` peer-resumed handler at ~line 1807 (`if (msg.type === 'peer-resumed')`): it calls `sfuClient.removePeer(msg.oldClientId)` + rekeys chat + deletes maps, but does NOT tell the recorder the old clientId left. So the old clientId's recorder source lingers (esp. given REC2) AND the participant metadata never gets a `leftAtMs`. Fix: in the peer-resumed handler, call `this.recorder.notifyParticipantLeft(msg.oldClientId)` (it marks leftAtMs + removePeerStream). The resumed peer's NEW clientId is then captured fresh by the add-effect. Confirm the new clientId's stream actually reaches the recorder (addPeerStream) after resume.

## Required fix (acceptance)
1. REC1: AudioContext is resumed in start(); a recording started on a suspended-context (mobile) device produces audible (non-silent) audio. Proven by a unit assertion that start() awaits ctx.resume() when suspended.
2. REC2: a dropped peer's recorder source IS removed (eviction iterates recorder-tracked ids, not current peers); recordedClientIds() getter added; sourceCount accurate after drop.
3. REC3: peer-resumed evicts the old clientId from the recorder (notifyParticipantLeft) and the resumed peer is captured under the new clientId; no orphaned old source.
4. No regression: normal record start/stop/upload, metadata participant tracking, B17 LEAK2/3 recorder/active-speaker, peer add/remove via the effect, peer-left handler (existing notifyParticipantLeft at ~1927), reconnect/admit (B15).

## Scope guards (MANDATORY — bypass mode)
- B18 ONLY (REC1/REC2/REC3). Touch: recorder.service.ts (start() resume + recordedClientIds() getter), room.page.ts (the recorder-sync effect removal loop + the peer-resumed handler line + await start() if start becomes async). Plus tests.
- Do NOT touch: SFU subscribe/transport (B08/B11), signaling (B15), ice-config (B16), the B17 leak fixes (call them, don't rewrite), active-speaker detection, media acquisition.
- Robust assertions — assert the OUTCOME (ctx resumed / dropped-peer source removed / resumed-peer re-captured + old evicted), not just that a function ran.

## Deterministic proof
- Unit specs (npx tsx): REC1 — start() with a suspended fake ctx calls/awaits resume() before recorder.start(); REC2 — after a peer leaves activePeerIds, the eviction removes that recorder source (recordedClientIds drives it) + sourceCount correct; REC3 — peer-resumed path calls notifyParticipantLeft(oldClientId) (old source removed) and the new clientId gets a source.
- Re-run existing recorder specs + the B17 recorder-leaks/active-speaker-leaks specs (no regression). `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST in changes.md: real mobile (iOS/Android) audible-recording + real drop/reconnect-during-recording is JROM's seat — unit/build proves the mechanism, not the device. Do NOT claim device-proven by e2e.

## Plan handshake (MANDATORY)
1. Read brief + findings + recorder.service.ts (start/addPeerStream/removePeerStream/notifyParticipantLeft/sourceFor) + room.page.ts (the recorder-sync effect ~693-702 + peer-resumed handler ~1807 + how start() is called).
2. Reply PROPOSED: REC1 resume approach (+ start() async + caller await), REC2 getter + eviction rewrite, REC3 handler fix, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit (3-agent: projcore validates + independent 2nd validator, then commits).

## Artifacts (under <run-dir>/validation/B18/)
scenarios.md, changes.md (Root Cause per REC + per-file WHY + honest device-seat note), review.md, test-report.md, independent-validation.md. decisions/ entry for the resume + eviction-source strategy.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-18 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
