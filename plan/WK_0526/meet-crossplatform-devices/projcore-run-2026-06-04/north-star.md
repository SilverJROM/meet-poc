# North Star — meet-crossplatform-devices (2026-06-04 Manila)

Triggered: JROM cross-device test. macbook↔iphone works; Android / PC-with-external-mic-cam fail; in-call camera enable still broken on those ("previous fix didnt work"). "have codex 5.5 help you."

## Root cause (CONFIRMED, see diagnosis-evidence.md)
`deviceId: { exact: <id> }` in videoConstraints + audioCaptureConstraints with NO fallback → OverconstrainedError on any device whose camera/mic id ≠ the persisted id. macbook matches → works; Android/PC/external don't → camera/mic never opens. Fake-media e2e can't reproduce (synthetic devices accept any id) → masked it twice.

## Non-negotiables
- **NS1 — Robust acquisition (exact→graceful fallback):** when a persisted/selected deviceId is used and getUserMedia throws OverconstrainedError/NotFoundError, RETRY without the exact constraint (ideal/drop deviceId; keep facingMode for mobile) so camera/mic ALWAYS open on any device. Apply to BOTH camera and mic, ALL acquire paths (preflight, reacquire, toggleCamera, toggleMic, replaceAudioTrack, replaceVideoTrack). The app must never fail-to-open just because a saved id doesn't match this device.
- **NS2 — Real-device proof, NOT fake-media e2e:** fake-media CANNOT reproduce OverconstrainedError. Acceptance = unit-test the fallback decision/constraint-builder + code review of the retry path. Real Android/PC/external confirmation is JROM's seat — DO NOT mark fully fixed on e2e alone. (Lesson from 2 prior premature VERIFIEDs.)
- **NS3 — Diagnose-ability (B2):** capture platform/userAgent + selected/active device ids + getUserMedia error name into diagnostics so cross-platform failures are visible in the DB (today they're invisible).
- **NS4 — No regression:** macbook/iphone path keeps working; device selection still honored when the id DOES match; mic-persistence, audio playout/watchdog, camera-in-call (B1 prior), feedback limiter all intact.
- **NS5 — Surgical:** media.service.ts (videoConstraints/acquire), mic-energy.ts (audioCaptureConstraints), the acquire call sites; B2 diagnostics capture in the diagnostics payload builder + schema. Do NOT touch SFU subscribe/transport, layout, mic-join-gate.
- **NS6 — codex 5.5** implementer (JROM directive). Verifier ≠ fixer. Manila time in logs.

## Batches
- B1: Robust device acquisition — exact→fallback for camera+mic, all paths (PRIMARY, fixes Android/PC/external).
- B2: Diagnostics platform/device/error capture (visibility for future cross-platform diagnosis).
- (Codex also checks the replaceTrack/transceiver publish path as secondary.)

## JROM LOCKED GOAL (2026-06-04, verbatim) — UNIVERSAL DEVICE SUPPORT
> "this app should work with all devices that has even a mic and can open a browser whatever it may be or what pc, phone, ios, android, linux, etc whatever this app should work for them like zoom/meet/etc with camera as well but even if device does not have camera but has a mic + speaker browser it should work no questions asked that is the goal this app is universal and no BS fuckery, host and users can hear each other at the very least, and see each other if they have camera"

MINIMUM VIABLE per device: mic + speaker + browser ⇒ two-way AUDIO works (host & users hear each other). Camera = optional enhancement (see each other IF present). No required setup beyond browser permission. Match Zoom/Meet ease.

## Confirmed run parameters (JROM 2026-06-04)
- Timeline: NO fixed deadline — optimize for genuinely-right (99-100% confidence).
- Lean refactor: FOCUSED — consolidate only what we touch (low risk to working audio/camera/feedback fixes), re-test after.
- Scope latitude: YES — fix stiffness in the media/permission/device domain (logged in req doc, validated). Not unrelated areas.

## PROCESS (JROM-specified, autonomous once started)
1. Investigation loop: me + codex 5.5 investigate INDEPENDENTLY each round → discuss → agree → LOG to findings.md. Next round: investigate knowing what we agreed, find MORE. Loop STOP RULE (JROM 2026-06-04): 3 consecutive ZERO-issue fan-out rounds OR 30 rounds. Continue while last 2 rounds find >=1 issue. (if 10 reached <99%, log it). Output = raw issues list.
2. Req doc: me + codex debate + agree → og-requirements (this run).
3. Plan → codex implements → projcore validates (2-3 agent topology per plan complexity).
4. Lean review (focused) → re-test everything still works.

## POST-FIX REGRESSION GATE (JROM 2026-06-04, MANDATORY before handback)
After ALL fixes implemented + validated + leaned + tested: run the SAME full-roster multi-model fan-out 3 MORE rounds (post-fix). Must find 0 new issues / 0 regressions across all 3. Only THEN hand back to JROM. If a regression is found → fix → restart the 3-round post-fix gate.

## POST-FIX REGRESSION GATE v2 (JROM 2026-06-04) — refined
After fixes: run the full-roster fan-out. Baseline 3 rounds. If ANY round finds a BLOCKING (HIGH/MED, NOT ant-size) issue/regression → FIX it → run +2 MORE fan-out rounds; keep extending +2 per blocking-fix until a clean streak shows NO MORE BLOCKING. Ant-size in post-fix = logged-to-fix but does NOT extend the gate. Only hand back to JROM once the post-fix fan-out is BLOCKING-clean.

## TIME HORIZON (JROM 2026-06-04)
JROM authorized this run to take 2-3 DAYS if needed for a genuinely CLEAN app. Optimize for zero-defect / foolproof over speed. Do not cut corners or shortcut the gates to save time/tokens. A long run is acceptable and expected.

## HANDBACK ACCEPTANCE GATE (JROM 2026-06-04) — ABSOLUTE
At handback: ZERO goal-blocking issues. Ant-size (LOW/cosmetic/secondary) remaining is acceptable (logged). GOAL-BLOCKING = anything that breaks the universal goal: a mic+speaker+browser device failing two-way audio, or a camera device failing video, on any platform. The post-fix fan-out gate must specifically prove NO goal-blocking remains (in code/logic/tests). Real-device confirmation (Android/PC-external/iOS/cameraless) is JROM's final test — handback will state exactly which, honestly, but I must have eliminated every goal-blocker detectable by analysis + testing + a clean fan-out first. Do NOT hand back with any known goal-blocker.

## BUILD-PHASE ROSTER (JROM 2026-06-04): req/plan/implement/validate = ME (opus) + codex 5.5 ONLY. One batch at a time (JIT req/plan→agree→implement→validate, not a full upfront plan). Re-spin the FULL fan-out roster (spark/gpt54/sonnet/haiku) only for the POST-FIX regression gate.

## DYNAMIC QUEUE (JROM 2026-06-04): the OVM task list EXPANDS on new blockers.
Any new GOAL-BLOCKING issue found during implement/validate/post-fix-regression → append a NEW batch row to queue.md (do NOT hide it inside an existing task) + overmind sync, so the task count reflects reality. Run is complete only when ALL batches done AND post-fix fan-out is blocking-clean AND handback gate (zero goal-blocking) met.

## SEQUENCING (JROM 2026-06-04): LEAN BEFORE the post-fix fan-out.
Order: all functional+UX+tiny batches → LEAN1 (lean/modular refactor + TS1/TS2/TS3 + dead code) → RETEST1 (re-test prior fixes + build on post-lean code) → POSTFIX1 (regression fan-out audits the COMPLETE post-lean codebase; the lean refactor itself MUST be audited by the fan-out) → HANDBACK1. The fan-out is the FINAL audit of ALL changes including the lean pass. No handback until POSTFIX1 is blocking-clean.
