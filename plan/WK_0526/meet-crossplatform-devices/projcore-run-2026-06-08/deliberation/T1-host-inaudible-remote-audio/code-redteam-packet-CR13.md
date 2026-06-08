# CODE RED-TEAM — round CR13 — lens L13: CRITICAL-capability integrity (talk / record / see)
# (Your role = the model you run as.) STREAK 2/3 (CR11+CR12 critical-clean under the refined gate).
## THE GATE (JROM, refined): a finding only RESETS the streak if it is CRITICAL.
- CRITICAL = a real path that BREAKS or threatens: (T) every party can TALK = be HEARD by others + HEAR others; (R) RECORD captures correct audio+video; (S) every party can SEE each other (video received). I.e. participant inaudible/unheard, recording missing audio/video, video not received, or a publisher suppressed/stranded.
- NON-CRITICAL = cosmetic/UI, banner/observability accuracy, diagnostics, test gaps, security-hardening, perf, dead code. (Report them — they get fixed — but they do NOT reset the streak.)
- You MUST classify EACH finding as [CRITICAL] or [NON-CRITICAL].
## READ the CURRENT files + ../IMPL-prod-diff.patch.
## Your task — lens L13: hunt specifically for CRITICAL breakage of the 3 capabilities (evidence file:line)
1. **TALK — be HEARD:** can a participant's audio fail to reach others? (publish path, mid-guard never permanently strands a publisher, the SFU forwards). Any path where someone speaks but others can't hear them?
2. **TALK — HEAR others:** the whole remote-audio playout (the fix) — any CURRENT path where a host receives a publisher's audio but can't hear it (the original bug), or a publisher is dropped/suppressed? (registry, sink-before-play, sticky-unlock, mid-guard reclaim).
3. **RECORD:** does the recorder still capture BOTH local + all remote audio AND video correctly? Any path where recording is silent, missing a participant, or missing video? (recorder.service + room wiring — independent of the audio fix, but verify.)
4. **SEE:** remote VIDEO receive — any path where a participant's camera video is not received/rendered? (the fix removed the tile AUDIO element — did it affect tile VIDEO? screen-share video? subscribe of video tracks?)
5. Any other CRITICAL break of talk/record/see.
Also note any NON-CRITICAL items (classified as such) — they'll be fixed but won't reset.
## Output `<role>-coderedteam-CR13.md`:
```
# <role> CODE red-team CR13 (lens L13: CRITICAL talk/record/see)
## TALK (be-heard / hear-others): any CRITICAL break? (file:line) or none
## RECORD (audio+video captured): any CRITICAL break? or none
## SEE (video received): any CRITICAL break? or none
## Findings (each tagged [CRITICAL] or [NON-CRITICAL], file:line) or "none"
STATUS: CRITICAL-CLEAN — no CRITICAL break of talk/record/see (non-critical items, if any, listed)
   OR
STATUS: CRITICAL-BUG — <the critical break>
```
Focus on CRITICAL. Honest.
