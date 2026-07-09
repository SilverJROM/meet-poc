# Callbacks — projcore-run-2026-07-09

[2026-07-09T01:32:15+00:00] [projcore] STATUS: APPROVED-PLAN — structural check PASS (21 batches, all est<=30, capture-path L3+delib+standard, F1 2-party no-op folded). Custody taken. Beginning B01.
[2026-07-09T01:32:57+00:00] [projcore callback] coord B01 STATUS: APPROVED-PLAN — call-ledger harness module
[2026-07-09T01:38:04+00:00] [projcore callback] impl B01 STATUS: DONE — eada423 call-ledger 15/15 tests
[2026-07-09T01:41:15+00:00] [projcore callback] redteam B01 STATUS: DONE — CLEAN
[2026-07-09T01:42:54+00:00] [projcore callback] validator B01 STATUS: DONE — FAIL — empty/ws IDs + mutable getState
[2026-07-09T01:45:52+00:00] [projcore callback] validator B01 STATUS: DONE — FAIL — getState shallow object refs
[2026-07-09T01:48:47+00:00] [projcore callback] validator B01 STATUS: DONE — PASS
[2026-07-09T01:48:47+00:00] [projcore] B01 VERIFIED → dispatch B02
[2026-07-09T01:55:22+00:00] [projcore] B02 APPROVED-PLAN sent (resumed autonomous loop — no idle)
[2026-07-09T02:00:15+00:00] [projcore callback] impl B02 STATUS: DONE — commit 058af0e
  Recording/transcript arbiter: LoudnessAnalyzer (RMS/LUFS on voiced segments) + RecordingArbiter (WAV parse/analyze/verdict).
  First-class loudness ratio API: computeLoudnessRatio(quiet, normal) — binding A design for same-speaker attenuated-vs-normal.
  Verdict logic: INVALID if stimulus missing/failed; PASS if verified; stats logged never decide PASS alone.
  15 tests passing (unit: RMS/LUFS/ratio/segments; integration: synthetic round-trip normal+attenuated).
  Ready for redteam (budget) + validator L2.
[2026-07-09T02:00:09+00:00] [projcore callback] impl B02 STATUS: DONE — 058af0e recording-arbiter 15/15 vitest
[2026-07-09T02:01:27+00:00] [projcore callback] redteam B02 STATUS: DONE — FINDINGS
[2026-07-09T02:03:33+00:00] [projcore callback] impl B02 STATUS: DONE — 202f156 path+FAIL fixes
[2026-07-09T02:05:29+00:00] [projcore callback] validator B02 STATUS: DONE — PASS
[2026-07-09T02:07:06+00:00] [projcore] B03 APPROVED-PLAN
[2026-07-09T02:10:43+00:00] [projcore callback] impl B03 STATUS: DONE — 27a5ef7 19/19 scheduler tests
[2026-07-09T02:13:35+00:00] [projcore callback] redteam B03 STATUS: DONE — CLEAN; validator B03 PASS
[2026-07-09T02:28:10+00:00] [projcore callback] impl B04 STATUS: DONE — 6a16127 T_gap=3400ms scaffold
[2026-07-09T02:31:54+00:00] [projcore callback] validator B04 STATUS: DONE — PASS
[2026-07-09T02:31:20+00:00] [projcore callback] validator B04 STATUS: DONE — PASS
[2026-07-09T02:40:26+00:00] [projcore callback] impl B05 STATUS: DONE — df13135 gum-shim 11/11
[2026-07-09T02:49:53+00:00] [projcore callback] validator B05 STATUS: DONE — PASS
  df13135 gum-shim: mandated `npx vitest run harness/__tests__/gum-shim.test.ts` 11/11.
  Post-gUM GainNode PROVEN BY MEASUREMENT, not by comment: real track getSettings() = {ec:true,ns:true,agc:true} (AGC genuinely engaged), yet measured gain = 0.5026, rel-err <=1.2% vs 20% budget, 5/5 stable. Upstream placement would have driven the ratio toward 1.0; it does not.
  INVALID path real: arbiter determineVerdict has three distinct branches; verifyStimulus returns undefined on null/degenerate baseline. No silent PASS.
  No app edits: commit is 100% e2e/harness/; frontend/backend diff empty. Also verified behaviorally — shimmed track yields unappliedAudioProcessing()=[] (no false AGC-declined alarm) and mediaTrackDeviceId()="" (guarded). App is unaware.
  Non-blocking findings (queue separately, NOT B05 acceptance breaches):
    F1 real mic track never stopped + AudioContext never closed -> leak per gUM acquire (media.service.ts:337 re-acquire path).
    F2 verifyStimulus has no minimum-signal floor: a dead mic (nonzero noise floor) gives baseline=n, attenuated=0.5n -> measuredGain=0.50 -> PASS. Catches digital silence only. Matters before this meets live recordings.
    F3 arbiter comment "stats never decide PASS alone" contradicts code — PASS decided by stimulus alone; voicedSegments/overallLoudness unread. B02/B04 surface, not B05.
    F4 PRE-EXISTING (byte-identical at df13135^): harness/__tests__/call-ledger.test.ts hand-rolls its own test()/process.exit(), registers zero vitest suites -> `vitest run harness/` = 1 failed | 5 passed, 50 tests pass. Harness suite not green repo-wide; B01 call-ledger assertions are not executing under vitest.
  Report: validation/b05-validation.md. Verifier != fixer: no code modified; two throwaway probes created and removed, e2e/ clean.
[2026-07-09T02:49:58+00:00] [projcore callback] validator B05 STATUS: DONE — PASS (F1/F2 non-blocking logged)
[2026-07-09T02:49:58+00:00] [escalation-note] B05 F1 AudioContext leak; F2 dead-mic can PASS stimulus — queue as follow-on fix batch if needed
[2026-07-09T02:55:02+00:00] [projcore callback] impl B06 STATUS: DONE — 2850c2a
[2026-07-09T02:58:59+00:00] [projcore callback] validator B06 STATUS: DONE — FAIL — scaffold insufficient
[2026-07-09T03:05:30+00:00] [projcore callback] validator B06 STATUS: DONE — PASS — 45c2d7b live PipeWire set/restore proof on silverjrom@192.168.254.123; full dual-call AGC measurement remains OPEN
[2026-07-09T03:06:19+00:00] [projcore callback] validator B06 STATUS: DONE — PASS
[2026-07-09T03:21:22+00:00] [projcore] RESUME autonomous loop for B07
[2026-07-09T03:22:12+00:00] [projcore callback] impl B07 STATUS: DONE — 3b19bfa mechanism proven; AC4/AC5 OPEN
[2026-07-09T03:31:00+00:00] [projcore callback] validator B07 STATUS: DONE — PASS (AC4/AC5 OPEN)
[2026-07-09T03:34:08+00:00] [projcore callback] coord planning STATUS: WORKING — co-planners launched D28 replan
[projcore callback] coplanner B STATUS: WORKING — reading D28 realignment brief and source docs
[2026-07-09T03:34:57+00:00] [projcore callback] coplanner A STATUS: WORKING — reading D28/D27/D14-D26 + code grounding for atomic replan
[projcore callback] coplanner B STATUS: DONE — plan.md + queue-batches.md ready D28
[2026-07-09T03:45:24+00:00] [projcore callback] coplanner A STATUS: DONE — converged with B; structural check found 4 blockers, patched plan.md + queue-batches.md (32 rows, tiers/deps/ACs verified)
  CONVERGED on all binding D28 constraints (AC15 first net-new, AC4 branch-on-diagnosis, absolute target-loudness, AC16 mid/late, AC18 last-ish, B01-B07 banked). Did NOT rewrite. Zero standing disagreements.
  BLOCKERS found by grounding B's plan in source (all patched, cited file:line in decisions/2026-07-09-d28-replanning-notes.md CONVERGENCE section):
    D1 B08A was not atomic (bundled a nonexistent stats reader + classifier + 2 injections + a live transcript assertion) -> split B08A-1/-2/-3. AC15 stays first net-new, zero calls.
    D2 EVIDENCE SPINE MISSING: no dual-browser call driver, no receive-side recorder, no transcriber. RecordingArbiter only ANALYZES a WAV on disk. Every live AC (AC1,2,4,5,6,7,8,9,15-live,16) was blocked with no row building it -> added B08S-1/B08S-2.
    D3 AC15 needs NEW product code: extractOutboundAudioSource returns no totalSamplesDuration (mic-energy.ts:92-105); hasOutboundAudioTrack is existence-only (sfu-client:819-835). Nothing reads packetsSent/bytesSent deltas -> named in B08A-1.
    D6 verifyStimulus false-PASSes a dead mic (B05 F2, never queued): baseline=n, attenuated=0.5n -> gain 0.50 -> PASS. It is B08 sweep's own INVALID gate -> added B00F before B08.
  KEY MECHANISM (D4, sharpens D28.3 — recommend /north record as addendum): classifyMicCapture returns working the moment capture totalAudioEnergy advances (mic-energy.ts:175-176), BEFORE variance. So on sender-dead/capture-alive, R1 NEVER FIRES — 856104f is BLIND there, not wrongly-remedied. Sender branch is unreachable from R1's trigger -> added B13W (watchdog) before B13 (remedy).
  ALSO: D5 sender-dead injection must be setParameters({encodings:[{active:false}]}) — replaceTrack(null)/track.enabled=false forge capture-dead. D8 B10 must not ramp mute (applyVolumeState writes mute+volume+autoGain). D9 restartIce/renegotiate/full-republish already exist (sfu-client:1082,:459) — wire, dont build. D10 added B08X: read-only zero-call archaeology on 652c1475 may decide T1 before burning a call (non-blocking, INCONCLUSIVE ok). D11 AC3 was claimed by NO batch -> B10 now closes it. D12 escaped pipes in 2 cells would break a pipe-splitting structural checker -> removed.
  VERIFIED: 32 rows plan==queue; 0 malformed; all est<=30; 9 capture-path rows all L3/L3/yes/standard; no sonnet-validates-sonnet; all deps resolve; all 18 ACs map to a closing batch (AC15->B08A-3).
[2026-07-09T03:46:12+00:00] [projcore callback] coord planning STATUS: DONE — D28 plan custody; dispatching B08A-1
[2026-07-09T03:46:26+00:00] [projcore callback] impl B08A-1 STATUS: WORKING — session launched awaiting PROPOSED
[2026-07-09T03:47:57+00:00] [projcore callback] impl B08A-1 STATUS: PROPOSED — one-getStats() outbound-liveness reader; awaiting APPROVED-PLAN
[2026-07-09T03:48:28+00:00] [projcore callback] coord replan STATUS: PROPOSED — D28+D29 plan ready; B08A-1 brief D29-amended; spine+B13W approved
[2026-07-09T03:49:16+00:00] [projcore callback] impl B08A-1 STATUS: PROPOSED — D29 rev2: reader (getOutboundLiveness) + per-track diagnostics emit (SfuOutboundTrackStats), no R1 touch; awaiting APPROVED-PLAN
[2026-07-09T03:49:41+00:00] [projcore callback] coord B08A-1 STATUS: APPROVED-PLAN — D29 rev2 reader+diagnostics emit
[2026-07-09T03:50:30+00:00] [projcore callback] impl B08A-1 STATUS: WORKING — implementing extractOutboundLiveness + getOutboundLiveness + diagnostics emit
