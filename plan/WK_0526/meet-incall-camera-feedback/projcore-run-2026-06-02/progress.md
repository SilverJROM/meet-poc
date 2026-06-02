# progress.md — meet-incall-camera-feedback

| Batch | Req | Dispatched | Est | State | Gate |
|-------|-----|-----------|-----|-------|------|
| B1 | RC | ~04:43 | ~44m | DONE+VERIFIED | camera live-proven; mic non-stiff |
| B2 | RF | ~06:24 | ~30m | DONE (pipeline) | scenarios ✓ changes ✓ review ✓ test-report ✓ indep-validation ✓ |

## Log
- 2026-06-02 ~04:10 — Run created from PH call 5d9ec218 (which also live-confirmed prior B1 audio-playout fix). Diagnosis: camera toggle no-ops when no localStream; feedback = cross-device acoustic coupling + {ideal} EC. JROM frontloaded decision: feedback = SUPPRESSION ONLY (no UI/auto-mute). Branch off master a4c81cc. Dispatching B1 (camera).
[overmind] 2026-06-02T04:39:50+00:00 register OK run_dir=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02 wf=14
[overmind] 2026-06-02T04:39:50+00:00 child sync OK (child-add meetapla:implementer) children=["meetapla"]
[overmind] 2026-06-02T04:39:50+00:00 sync OK current='Enable camera in-call when not granted pre-join (RC)' tasks=2

- 2026-06-02 ~04:43 — B1 PROPOSED (3m): found parity hook (sfu-client pre-negotiates audio+video sendonly transceivers at publish → replaceTrack works post-publish, no renegotiation). Plan = mirror confirmed-working video-acquire for mic (toggleMic async: getUserMedia→adopt/addTrack→publish→startMicLevel), camera no-stream acquire branch, non-blocking actionNotice unblock-hint on hard-block, pure acquire-vs-flip helper unit-tested. Buttons already never-disabled (structurally). APPROVED-PLAN (4 emphases: await caller, dismissible hint, verify mic publishes via sfuClient.replaceAudioTrack, e2e soft). Full pipeline running.
[overmind] 2026-06-02T04:43:53+00:00 sync OK current='Enable camera in-call when not granted pre-join (RC)' tasks=2
[overmind] 2026-06-02T06:18:13+00:00 sync OK current='Enable camera in-call when not granted pre-join (RC)' tasks=2

- 2026-06-02 ~06:18 — B1 DONE + VERIFIED (projcore independent: camera live-proven e2e S4, mic toggle non-stiff, build green, tsx spec pass, scope clean). JROM decision: KEEP mic-required-to-join (mic-acquire path stays defensive/unreachable). B1 commits @ dcda820 (left for run-end merge). JROM new standing pref: set child /effort dynamically (medium default, high only for complex). Dispatching B2 (feedback suppression, MEDIUM effort).
[overmind] 2026-06-02T06:20:25+00:00 sync FAIL (best-effort, continuing): 0 characters or fewer","value":"In-call mic+camera always enable-able (RC) — VERIFIED. Camera live-proven; mic toggle non-stiff; mic-acquire defensive (mic-join-gate KEPT per JROM). Deployed."}]}422
[overmind] 2026-06-02T06:20:36+00:00 sync OK current='Same-room feedback suppression, no UI (RF)' tasks=2

- 2026-06-02 ~06:24 — B2 PROPOSED (2m48s, medium effort): capture EC/NS/AGC already single-chokepoint (audioCaptureConstraints) → keep {ideal} (max non-breaking), add verify-applied helper. Limiter = DynamicsCompressorNode (thr -3dB, ratio 20:1, hard knee) inserted gain→limiter→destination; default gain already 1.0. APPROVED-PLAN (allow log-only line; don't clamp persisted volume; re-run remote-audio specs for no-regression). Implementing.
- 2026-06-02 ~07:?? — B2 DONE (full pipeline). Implemented: `unappliedAudioProcessing` pure verify helper + log-only `verifyAudioProcessing` at 2 audio-acquire sites (mic-energy.ts, media.service.ts); `FEEDBACK_LIMITER_PARAMS` DynamicsCompressor limiter wired gain→limiter→destination + reset() teardown (remote-audio.service.ts); DEFAULT_VOLUME left at 1.0, MAX_VOLUME 1.3 unchanged. Commits 85749cb (source+specs) + 7ef5266 (artifacts) on feat/incall-media-always-enableable-20260602. Gates: qa scenarios (S1-S11) ✓; reviewer APPROVE (log-only confirmed, graph wiring confirmed, no UI/banner, sfu-client failure confirmed PRE-EXISTING) ✓; qa test PASS (11/11 in-scope tsx specs, ng build exit 0) ✓; independent validator (fresh Opus) PASS all 5 acceptance items ✓. Deployed to DEV (pm2 restart meet-poc-fe → online); NOT merged to master — left for projcore at run-end (B2 committed on same branch as B1, no separate batch branch). Live two-device A/B = JROM hardware (S6/S7 DEFERRED-LIVE). Honest caveat recorded: software reduces, can't fully eliminate two-device feedback.
[overmind] 2026-06-02T06:24:19+00:00 sync OK current='Same-room feedback suppression, no UI (RF)' tasks=2

- 2026-06-02 ~06:40 — B2 DONE + VERIFIED (projcore independent: limiter graph no double-path, EC chokepoint, all specs incl. existing remote-audio playout specs PASS, build green). Phase 3: merged B1+B2 branch → master (clean ff, 7ef5266). All RC+RF VERIFIED. Run COMPLETE. Live-pending: camera mid-call (DEV-live), feedback two-device A/B = JROM seat.
[overmind] 2026-06-02T06:40:44+00:00 sync OK current='' tasks=2
[overmind] 2026-06-02T06:40:45+00:00 complete OK
