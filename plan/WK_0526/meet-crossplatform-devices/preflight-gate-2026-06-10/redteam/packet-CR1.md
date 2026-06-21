# RED-TEAM CR1 — lens L1: does the fix ACTUALLY close the silent never-publish? (the core bug)
# Role = the model you run as (sonnet | haiku | opus). Claude-only panel.
## Context: implemented the pre-join gate. The CORE bug was: joiner admitted but doPublish() never ran (hasPc=false), host hears nothing, NO error shown. Fix claims: gate in-call on publish 'published', publishTriggerCount observability, initialPublishStream throws on no-live-track, never-silent guards, audio-failed -> config panel.
## Read: ../DESIGN-SPEC.md, ../og-requirements.md (R1-R8), redteam/IMPL-prod-diff.patch, and the REAL files (room.page.ts, room-decisions.ts, device-dialog.component.*, meeting-sessions.service.ts).
## Your task — lens L1 (evidence file:line). Hunt for RESIDUAL silent-failure / never-publish paths:
1. Is there ANY path where an admitted joiner ends up NOT publishing (hasPc=false OR published-but-no-real-audio) WITHOUT the user seeing audio-failed + the config panel? Trace every early-return / catch / race in: the admitted handler (~1777/1786), publishInitialSfuWithRetry (~1554), publishSfuOnceAfterAdmit, initialPublishStream (~1655/1717), verifyInitialCaptureEnergy/B2a. 
2. Does "fully in-call" UI truly gate on publishStatus==='published' (R3), or can the user see a working call before publish confirms? 
3. Is the 'audio-connecting' state bounded by a TIMEOUT (no infinite "Connecting…")? 
4. The empty-transceiver path (publish 'succeeds' with no live track): is it REALLY caught now? 
5. publishTriggerCount/roomState actually persisted + correct?
## Classify findings CRITICAL (talk/record/see broken OR silent-never-publish residual) vs NON-CRITICAL.
## Output redteam/<role>-CR1.md:
```
## Residual silent/never-publish paths? (file:line) or none
## in-call gated on 'published'? connecting timeout bounded? empty-transceiver caught?
## Findings [CRITICAL]/[NON-CRITICAL] (file:line) or none
STATUS: CRITICAL-CLEAN (no silent-never-publish residual) OR STATUS: CRITICAL-BUG — <worst>
```
Ruthless + honest. CLEAN only if you truly tried to break it.
