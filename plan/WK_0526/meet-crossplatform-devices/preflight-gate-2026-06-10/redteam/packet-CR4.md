# RED-TEAM CR4 — CONVERGENCE pass. lens L4: confirm all CR1-CR3 fixes hold + whole-gate final sweep.
# Role = your model. This is the gate. CRITICAL-CLEAN only if you genuinely tried to break it and found nothing CRITICAL.
## Read: og-requirements.md (R1-R10), redteam/IMPL-prod-diff.patch, real files. The fixes so far: CR-fix-1 (silent never-publish closed), CR-fix-2 (mic-gate positive signal + speaker confirm), CR-fix-3 (host badge + quiet guests + R10 matrix), CR-fix-4 (R9 roster-iteration + grace + mute).
## Lens L4 attack questions (file:line; classify CRITICAL vs NON-CRITICAL):
1. R9 NOW correct? classifyPeerAudioHealth (room-decisions.ts) + updateRemoteAudioHealth (room.page.ts): does the host badge NOW fire for an admitted-but-never-published peer (Joanne) past the 7s grace? Does it NOT fire for muted / within-grace / healthy peers? Any new hole (e.g. peer leaves during grace, micEnabled missing/stale, peerFirstSeen leak)?
2. Whole-gate CRITICAL sweep: trace the full guest journey (green room -> mic verify -> speaker verify -> join -> admit -> publish -> ready) AND a host journey. ANY remaining path where: a good user is blocked, a broken user joins undetected, audio/video/record breaks, or a failure is silently mishandled (to BOTH guest and host)?
3. Quiet-guest vs host-aware: is there ANY failure where the guest is quiet (correct) AND the host ALSO doesn't get the badge/diagnostics (host blind = bad)?
4. R10 matrix: are all the failure-mode rows covered by meaningful (revert-failing) tests? Any failure mode with no test?
5. Regressions from CR-fix-1..4 in adjacent areas (recording, video, reconnect, persistence R8).
## Output redteam/<role>-CR4.md:
```
## R9 correct now (Joanne badged, no FPs)? whole-gate sweep result?
## Any remaining CRITICAL (good-user-blocked / broken-user-undetected / silent-to-both / talk-record-see broken)?
## Findings [CRITICAL]/[NON-CRITICAL] (file:line) or none
STATUS: CRITICAL-CLEAN or CRITICAL-BUG — <worst>
```
Honest convergence gate.
