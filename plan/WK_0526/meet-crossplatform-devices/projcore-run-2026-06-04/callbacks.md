[projcore callback] R1 DONE found exact-device fallback gaps, optional-camera blocking paths, stale selection rollback gaps, micless join block, and SFU later-camera advertisement risk
[projcore callback] R2 DONE found TURN/relay hardening gaps, SFU transport no-recovery gaps, and post-publish audio/video subscription gaps beyond initial audio-only success
[projcore callback] R3 DONE found pagehide/mobile lifecycle leave risk, reconnect publish retry gap, stale speaker sink playback blocker, and first-run permission UX gaps
[projcore callback] R4 DONE found protected guest join password bypass and mic+optional-camera combined first-permission risk; no new iOS/Firefox must-fix beyond agreed items
[projcore callback] R5 DONE no new must-fix found; audio-only universality converges if agreed A/B/C/D fixes are implemented
[projcore callback] R6 DONE backend signaling/admit/roster multi-party pass found no new must-fix beyond locked A/B/C/D list
[projcore callback] REQ DONE requirements mostly cover the locked findings, but A13/A14/B6 need explicit requirements and R1/R2 wording needs one clarification
[projcore callback] R7-codex55 DONE reference-client parity pass found new polish/scale gaps in hot-plug recovery, mute control, adaptive video, speaker permission, secure-context UX, and mic/headset UX
[projcore callback] R7-spark DONE secure-context and device-matrix adversarial audit completed (no new must-fix beyond locked list)
[projcore callback] R7-gpt54 DONE lifecycle and multi-party scale audit found teardown gaps that can leak timers, subscriptions, and audio-node work across leave/reconnect cycles
[projcore callback] R8-spark DONE backend audit focused on room/admit and legitimate user block paths
[projcore callback] R9-gpt54 DONE adversarial frontend media-path reread found no new universality bugs beyond the locked plus R7/R8 findings
[projcore callback] R10-gpt54 DONE re-verification pass found no false positives or already-fixed items in the sampled findings and no new media-path issues
[projcore callback] R11-gpt54 DONE final universal-path adversarial pass found no new blocking cameraless or two-way-audio failures beyond the existing findings
[projcore callback] R12-gpt54 DONE final convergence confirmation found no remaining new blocking two-way-audio failures beyond the existing findings
[projcore callback] R9-spark DONE feature-detection and secure-context resilience sweep completed
[projcore callback] R9-codex55 DONE deep SFU subscribe pass found new transactional subscribe cleanup and same-media-kind reconcile risks
[projcore callback] R10-codex55 DONE SFU re-verification found one new screen-publish rollback gap; SFU-S1/2/3 otherwise remain the main subscribe risks
[projcore callback] R9-spark DONE feature-detection and secure-context check complete (no additional findings beyond existing locked + R7 + R8)
[projcore callback] R10-spark DONE re-verification sweep for remaining frontend utilities/guards/interceptors/auth/rooms services
[projcore callback] R11-spark DONE final convergence sweep for blocking + ant-size media UI permission/device/playback gaps
[projcore callback] R11-codex55 DONE no new blocking found; SFU-S1/S2/S3 remain the blocking subscribe risks and SFU-S4 remains secondary ANT
[projcore callback] R12-spark DONE final convergence pass confirms no new blocking device/permission/playback failures; only prior locked/R11 scope risks remain
[projcore callback] R12-codex55 DONE no new blocking found in final SFU/transport/core-audio confirmation; SFU-S1/S2/S3 remain the locked blocking set
[projcore callback] ARCH0 PROPOSED media-acquisition pure fallback/queue helper plus lobby preflight vertical slice
[projcore callback] ARCH0 DONE added serialized media acquisition helper and routed lobby preflight through mic-first audio plus best-effort camera
[projcore callback] B02 PROPOSED route remaining capture paths through acquisition ladder and reconcile selected ids after fallback
[projcore callback] B02 DONE routed remaining capture paths through acquisition ladder with publish rollback and selected-id fallback reconciliation
[projcore callback] B03 PROPOSED A4/D2 appear covered by separate queued acquisition; change A11 mobile video constraints to ideal-only and add focused pure guard coverage
[projcore callback] B03 DONE broadened camera-requested lobby fallback to audio-only, dropped mobile video max constraints, and verified spec plus frontend build
[projcore callback] B04 PROPOSED main audio/video acquire-before-destroy covered; fix SFU screen stop rollback/order gap
[projcore callback] B04 DONE made screen start rollback and screen stop callback-before-destroy transactional; focused spec and ng build green
[projcore callback] B05 PROPOSED join gate already runs mic acquisition ladder before blocking; no listen-only code pending approval
[projcore callback] B06 PROPOSED announce first mid-call camera/mic tracks by registering them with CF and broadcasting sfu-publish
[projcore callback] B06 DONE registered first mid-call audio/video tracks with CF, generalized partial subscribe, and verified focused spec plus frontend build
[projcore callback] B08 PROPOSED reset stuck publisher subscription state and bounded-retry via existing serialized subscribe path
[projcore callback] B08 DONE added bounded stuck-subscribe retry with per-publisher state reset and focused spec/build verification
[projcore callback] B09 PROPOSED wrap first SFU publish in bounded retry/backoff and expose retry/rejoin after cap
[projcore callback] B09 DONE added bounded first-publish retry with retry/rejoin after-cap UX and focused spec/build verification
[projcore callback] B10 PROPOSED run cleanupCall(false) on meeting-ended, then restore non-host toast after teardown
[projcore callback] B10 DONE meeting-ended now runs full cleanup before restoring non-host toast; build and teardown path verified
[projcore callback] B11 PROPOSED add serialized SFU transport recovery plus bounded reconnect republish retry
[projcore callback] B11 DONE added guarded SFU transport recovery with ICE restart/full-republish fallback and bounded reconnect republish retry
[projcore callback] B12 PROPOSED classify BFCache/mobile background as pause+resume and reserve full cleanup for real unload
[projcore callback] B12 DONE added lifecycle pause-vs-cleanup decision, BFCache pageshow resume, and healthy-publish-gated B11 republish
[projcore callback] B13 PROPOSED harden per-element sink routing with default fallback/clear-bad-id and persist speaker selection only after apply succeeds
[projcore callback] B13 DONE made setSinkId failures per-element safe with default fallback, bad-id clearing, and post-success speaker persistence
[projcore callback] B14 PROPOSED normalize terminal audio acquisition errors and branch exhausted mic recovery copy by final error class
[projcore callback] B14 DONE normalized Overconstrained media errors and branched exhausted mic recovery copy with focused spec/build proof
[projcore callback] B15 PROPOSED derive owner presence from live admitted/reconnecting membership and revoke durable clientKey identity on host removal
[projcore callback] B15 DONE derived host election from current owner admitted/reconnect grace state and revoked durable clientKey identity on removal/leave
[projcore callback] batch-16 PROPOSED retry ice-config with fail-loud join signal, shared relay-capable ICE mapping for publish/main, force-relay diagnostics, backend TURN env+health planned
[projcore callback] batch-16 DONE implemented ICE retry/fallback warning, shared publish ICE servers, force-relay diagnostics, backend env+health; build/touched tests green; DEV restarted
[projcore callback] batch-17 PROPOSED dedupe recorder/analyser graphs, track SFU retry timers, and weaken/prune debug track refs
[projcore callback] batch-17 DONE fixed recorder/analyser/timer/debug-track leaks; deterministic specs and frontend build green; DEV restarted
[projcore callback] batch-18 PROPOSED resume recorder AudioContext before MediaRecorder start, evict dropped recorder sources from tracked ids, and evict old source on peer-resumed
[projcore callback] batch-18 DONE implemented recorder resume-before-start, tracked-id stale peer eviction, peer-resumed old-id recorder cleanup; focused specs/build green; DEV restarted
[projcore callback] batch-19 PROPOSED transactional subscribe rollback, same-client cfSession eviction, stronger reconcile guard, and screen publish rollback planned
[projcore callback] batch-19 DONE implemented transactional subscribe rollback, same-client cfSession eviction, stronger reconcile guard, screen rollback; specs/build green; DEV restarted
[projcore callback] batch-20 PROPOSED Plan read; proposes surgical UX1/UX2/D1/CMP1 fixes with pure decision tests.
[projcore callback] batch-20 DONE UX1/UX2/D1/CMP1 implemented; decision spec and ng build pass; meet-poc-fe restarted.
[projcore callback] batch-21a PROPOSED stage device persistence until successful acquisition, clear stale camera pin, route mic re-enable through replaceAudioTrack ladder, and guard micOn on live tracks.
[projcore callback] batch-21a DONE implemented A8/A9/A12/TINY3; focused specs and regressions pass; ng build green; meet-poc-fe restarted.
[projcore callback] batch-21b PROPOSED Plan covers TINY2/TINY4/TINY6/ERR9 with watchdog re-read, listener detach/attach, enabled guard, and serialized sink application.
[projcore callback] batch-21b DONE implemented TINY2/TINY4/TINY6/ERR9; focused specs/regressions and ng build pass; meet-poc-fe restarted.
[projcore callback] batch-21c PROPOSED wrap toggle stop/upload in withTimeout, add recorder finalize-once guard, warn zero-audio skips, and label uploads with negotiated MIME.
[projcore callback] batch-21c DONE implemented REC4/REC5/REC6/REC8; focused specs/regressions and ng build pass; meet-poc-fe restarted; no commit.
[projcore callback] batch-21d PROPOSED re-arm lobby mic self-test after gesture audio activation and add platform/device/gUM context to diagnostics payload.
[projcore callback] batch-21d DONE implemented ERR6/ERR7 with focused decision spec, ng build green, DEV frontend restarted; no commit.
[projcore callback] batch-lean1 PROPOSED timer field browser-number types, spec-double type cleanup, stale backend expectation refresh, one dead DatePipe removal; no runtime behavior changes planned
[projcore callback] batch-lean1 DONE tsc zero, all frontend tsx specs pass, ng build green, backend touched tests green, DEV fe/be restarted; no commit
[projcore callback] batch-fix1 PROPOSED resume recorder AudioContext on lifecycle resume and no-op same-stream recorder re-adds; waiting for APPROVED-PLAN
[projcore callback] batch-fix1 DONE implemented recorder AudioContext lifecycle resume and same-stream source no-churn; focused specs, tsc, ng build green; DEV frontend restarted; no commit
[projcore callback] batch-fix2 PROPOSED separate bounded mid-call retry counter/timers, missing-track rederive from subscribed state, direct doSubscribeTracks retry, teardown cleanup; waiting for APPROVED-PLAN
[projcore callback] batch-fix2 DONE implemented bounded direct mid-call subscribe retry; focused specs, frontend tsc app/spec, ng build green; DEV frontend restarted; no commit
[projcore callback] batch-fix3 PROPOSED make doSubscribeTracks idempotent by filtering already-subscribed tracks before stamp/mutation/POST; waiting for APPROVED-PLAN
[projcore callback] batch-fix3 DONE implemented doSubscribeTracks idempotency filter; focused specs, tsc app/spec, ng build green; DEV frontend restarted; no commit
[projcore callback] batch-fix4 PROPOSED refetch ICE config only when prior resolution was relay-unavailable/STUN-only before full-republish recovery; margins adequate; waiting for APPROVED-PLAN
[projcore callback] batch-fix4 DONE implemented relay-unavailable-only ICE forceRefresh before full-republish recovery; focused specs, tsc app/spec, ng build, DEV restart, and smoke checks pass; no commit
[projcore callback] batch-fix4 DONE addendum cleared pending recovery ICE source on closeLiveTracksForExit/destroy; sfu-client spec, tsc app/spec, ng build, and DEV restart pass; no commit
[projcore callback] batch-fix5 PROPOSED add single-getStats international metrics capture plus owner-only diagnostics network-path readout; skip geo; backend raw payload confirmed; waiting for APPROVED-PLAN
[projcore callback] batch-fix5 DONE added single-getStats intl stats capture and owner diagnostics network-path readout; focused specs/backend round-trip, tsc app/spec, ng build, DEV restart, and smoke checks pass; no commit
