# RED-TEAM CR2 — lens L2: the GATE hard-block + config panel (R4) + persistence (R8) + device edge cases
# Role = your model (sonnet|haiku|opus). DISTINCT from CR1 (which was the never-publish path).
## Read: ../og-requirements.md (R1,R2,R4,R5,R6,R8), redteam/IMPL-prod-diff.patch, real files (room.page.ts/html, device-dialog.component.*, room-decisions.ts, controls-bar).
## Lens L2 attack questions (evidence file:line). Classify CRITICAL (talk/record/see broken or a user blocked-from-joining-WHEN-they-shouldnt OR able-to-join-broken) vs NON-CRITICAL:
1. GATE HARD-BLOCK (R1/R5): is Join truly blocked until mic verified AND speaker tested? Can a user bypass (race, refresh, direct state)? Is camera correctly OPTIONAL (camera-off user NOT blocked)? Does a user with NO mic device get a friendly block (not a crash)?
2. FALSE-BLOCK risk: can the gate WRONGLY block a user whose mic/speaker IS fine (e.g. classifyMicCapture false-negative on a quiet-but-working mic, speaker-test autoplay blocked on mobile counted as fail)? A gate that locks out good users is as bad as the bug.
3. CONFIG PANEL (R4): on issue, does the device-config/test panel actually open with mic meter + speaker test + camera preview + device dropdowns + 'confirm it's working' that RE-VALIDATES? Does switching a device in the panel actually re-acquire + re-validate + unblock? Any dead-end (panel opens but can't recover)?
4. PERSISTENCE (R8): trace select-mic -> store -> reload/rejoin -> re-apply. Is the mic/speaker/camera selection truly persisted + re-applied? Any remaining drop (the 2590 fix + fallback path)? Does a muted/unplugged device corrupt the stored preference?
5. PERMISSION edges: denied at gate, revoked mid-call, granted-then-device-unplugged. Friendly + recoverable?
## Output redteam/<role>-CR2.md:
```
## Gate hard-block correct + no false-block? (file:line)
## Config panel recovers (no dead-end)? Persistence holds?
## Findings [CRITICAL]/[NON-CRITICAL] (file:line) or none
STATUS: CRITICAL-CLEAN or CRITICAL-BUG — <worst>
```
Ruthless + honest.
