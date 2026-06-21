# RED-TEAM CR3 — lens L3: FINAL comprehensive pass (R9 correctness + quiet-guest-not-silent-to-host + R10 meaningfulness + CR-fix regressions)
# Role = your model. This is the convergence pass — be thorough; CLEAN only if genuinely clean.
## Read: og-requirements.md (R1-R10), redteam/IMPL-prod-diff.patch, real files (room.page.ts/html, room-decisions.ts+spec, tile.component.*, device-dialog.component.*, sfu-client.service.ts).
## Lens L3 attack questions (evidence file:line; classify CRITICAL vs NON-CRITICAL):
1. R9 FALSE-POSITIVE: classifyPeerAudioHealth (room-decisions.ts) — does a LEGITIMATELY MUTED guest (publishing, track exists, but enabled=false so ~no audio energy / bytes may stall) get a FALSE 'No audio' badge on the host's view? A badge that cries wolf on every muted participant is useless. How does it distinguish muted (fine) from broken (no-track/not-reaching-server)? Is bytesReceived the right signal (muted RTP often still flows DTX/comfort-noise)? 
2. QUIET-GUEST didn't reintroduce a HOST-blind silent failure: when a guest fails (publish/connection), does the HOST RELIABLY get the badge + diagnostics (the whole point — host must know)? Trace: guest audio-failed -> is remoteAudioUnhealthyIds set for that peer on the host? Any window where guest is broken but host shows no badge?
3. CR-fix-2 regression: micWorking (positive) + speakerVerified — any NEW false-block of a good user, or false-pass? 'indeterminate'-only mic never verifies -> stuck? speaker autoplay-catch correct?
4. CR-fix-1 still holds: no silent never-publish path reintroduced by the quiet-guest re-scope.
5. R10 tests MEANINGFUL: do the 40 assertions actually assert OUTCOMES that would FAIL if the fix were reverted, or are any vacuous? Is each failure-mode row genuinely covered?
6. Any other CRITICAL (talk/record/see broken, silent failure, gate locks out good users or admits broken).
## Output redteam/<role>-CR3.md:
```
## R9 false-positive (muted guest)? host reliably sees failures? (file:line)
## CR-fix-2/1 regressions? R10 tests meaningful?
## Findings [CRITICAL]/[NON-CRITICAL] (file:line) or none
STATUS: CRITICAL-CLEAN or CRITICAL-BUG — <worst>
```
Honest. This is the convergence gate.
