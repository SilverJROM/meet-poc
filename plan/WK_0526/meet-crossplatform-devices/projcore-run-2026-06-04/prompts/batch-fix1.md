Batch-FIX1: Post-fix ant fixes — resume recorder AudioContext on lifecycle resume (REC1-iOS) + stop recorder source churn (REC2)

Batch ID: batch-fix1
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (TESTH2 @ 5254307, LEAN1 @ 82b7857 latest). Do NOT commit (3-AGENT: projcore + independent 2nd validator).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT: recorder lifecycle). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier: LOW. Confirm/counter at PROPOSED.

## Context — POSTFIX regression fan-out result
The 9-reviewer + 3-verifier post-fix audit found ZERO goal-blocking regressions (all 4 SFU/transport blocking claims were dismissed as over-claims by deeper verification). Only TWO real, confirmed, NON-goal-blocking ANT bugs remain, both in recording. This batch fixes exactly those two. BEHAVIOR-PRESERVING for everything else.

## THE TWO FIXES (confirmed real by the audit)
- **REC1-iOS (recording goes silent after iOS background mid-recording)** — `frontend/src/app/services/recorder.service.ts`: the recording AudioContext (`private ctx`, ~line 84) is resumed ONLY in `start()` (~line 136 `if (ctx.state === 'suspended') await ctx.resume()`). There is NO accessor and NO resume call from the app's lifecycle-resume path. The B12 resume handler in `frontend/src/app/pages/room/room.page.ts` (`resumeAfterLifecycleFreeze`, ~line 2858, fired on pageshow/visibility resume) republishes SFU but never resumes the recorder's ctx. So if the recorder's AudioContext is suspended by iOS/Android backgrounding mid-recording, nothing resumes it → the recording captures SILENCE for the rest of the session. Fix: expose `async resumeAudioContext(): Promise<void>` on RecorderService that, IF recording and `this.ctx?.state === 'suspended'`, awaits `this.ctx.resume()` (try/catch + warn, never throw); call it from `resumeAfterLifecycleFreeze` (only when `this.recorder.isRecording()`), alongside the existing SFU republish. No-op when not recording / ctx not suspended.
- **REC2 (recorder source churn / micro-glitch)** — `frontend/src/app/services/recorder.service.ts` `addStream` (~line 272): for an EXISTING clientId it unconditionally `removePeerStream(clientId)` then re-adds (the B17-LEAK2 dedupe). `syncRecorderPeerStreams` (`frontend/src/app/pages/room/room-recording.ts`) calls `addPeerStream` for every active peer on EVERY recorder-sync effect run (any peers()-signal change: mic toggle, quality change, reconnecting flag). So an unchanged peer's audio source node is disconnected+reconnected on every peer-state change → a one-microtask gap = audible click/glitch in the recording for all peers. Fix: make the re-add a NO-OP when the clientId is already tracked AND the stream is the SAME object (store the source stream alongside the node, or compare). Only disconnect+re-add when the stream actually CHANGED (genuine reconnect with a new stream). Preserves B17-LEAK2 (a real stream change still replaces the source) and B18 (eviction/recordedClientIds unchanged).

## Required (acceptance)
1. REC1: resumeAudioContext() exists, is a no-op unless recording+suspended, never throws; wired into resumeAfterLifecycleFreeze guarded by isRecording(); an iOS-background-then-resume mid-recording resumes the recorder ctx → recording stays audible. (Unit: a suspended-ctx-while-recording → resumeAudioContext awaits resume; not-recording or running-ctx → no-op.)
2. REC2: re-running the recorder sync with the SAME stream for an existing peer does NOT disconnect/reconnect the source (no churn); a genuine stream CHANGE still replaces it; sourceCount unchanged; LOCAL source untouched. (Unit: same-stream re-add = no remove/add; changed-stream = replace.)
3. NO regression: B17-LEAK2 recorder dedupe, B18 REC1/2/3 (resume-in-start, eviction, peer-resumed), B21c finalize-once/mime, the B12 lifecycle pause/resume for the live call (SFU republish path unchanged), normal record start/stop/upload.

## Scope guards (MANDATORY)
- FIX1 ONLY (REC1-iOS + REC2). Touch: recorder.service.ts (resumeAudioContext + addStream same-stream guard), room.page.ts (call resumeAudioContext in resumeAfterLifecycleFreeze), room-recording.ts only if needed for the stream-compare. Plus tests.
- Do NOT touch: SFU/signaling/acquisition/relay, the B12 SFU-republish logic itself (only ADD the recorder-ctx-resume call beside it), the finalize-once guard, the reconcile/transport code. Do NOT change which sources exist (REC2 is a churn optimization, not an eviction change).
- Behavior-preserving except the two fixes. Robust assertions — assert the OUTCOME.

## Deterministic proof
- Unit specs (npx tsx, extend recorder-leaks.spec.ts or a focused spec): REC1 resume-when-recording+suspended / no-op otherwise; REC2 same-stream-no-churn / changed-stream-replaces / sourceCount stable / local untouched.
- Re-run recorder-leaks, room-recording, active-speaker-leaks specs. `npx tsc --noEmit` ZERO. `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real iOS background-resume recording audibility is JROM's device seat; unit proves the resume-wiring + churn-guard.

## Plan handshake (MANDATORY)
1. Read brief + recorder.service.ts (ctx/start/addStream/removePeerStream/sourceFor) + room.page.ts resumeAfterLifecycleFreeze (~2858) + room-recording.ts syncRecorderPeerStreams.
2. Reply PROPOSED: resumeAudioContext design + wiring, the same-stream churn guard (how you store/compare the stream), test plan, files, risks, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc 0 → specs green → ng build → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/FIX1/)
scenarios.md, changes.md (Root Cause + per-file WHY + NO-other-behavior-change note), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-fix1 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
