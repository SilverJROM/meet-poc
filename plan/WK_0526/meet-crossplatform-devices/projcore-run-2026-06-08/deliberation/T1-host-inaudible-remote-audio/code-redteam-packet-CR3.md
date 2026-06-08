# CODE RED-TEAM — round CR3 — the twice-corrected diff
# (Your role = the model you run as.)
## Context
CR1 found the P0 silent-no-banner; CR-fix-1 fixed it; CR2 found the voiceStalled latch could stick/false-positive; CR-fix-2 fixed THAT (non-sticky + energy-gated latch, touched-only subscribe rollback, trackName-join for diagnostics energy). Verify CR-fix-2 AND hunt for ANY remaining bug. We need 3 CONSECUTIVE clean rounds; CR1+CR2 were dirty so streak=0.
## READ the CURRENT files + ../IMPL-prod-diff.patch. Contract: ../consensus-r4-registry.md.
## Your task — find REAL bugs (evidence file:line)
1. voiceStalled latch (post CR-fix-2): is it now IMPOSSIBLE to stick? Check clearVoiceStalls is hit on no-sample / bytes-flat / no-energy / mutedAll / peer-removed. Is the energy-gate (sampleWindowHasVoiceEnergy) correct (window not single-point; thresholds sane)? Any path that sets stalled but never clears? Any flap?
2. Touched-only subscribe rollback: does it now preserve a concurrent publisher's post-snapshot stream AND still fully undo the failing subscribe's own tracks? Any half-rollback leak?
3. trackName join in diagnostics: does per-publisher energy now map to the right talker?
4. The CORE path (the actual fix): addPublisher sink-before-play, syncPeers diff/dedup/track-replace, banner, recovery, reset, mid-guard — any regression after 2 fix rounds?
5. Any NEW bug/race/silent-no-banner introduced by CR-fix-2.
## Output `<role>-coderedteam-CR3.md`:
```
# <role> CODE red-team CR3
## CR-fix-2 verify: latch-nonsticky / rollback-touched-only / energy-join — OK or gap
## NEW bugs (table severity|file:line|what|fix) or "none"
STATUS: CLEAN — no real bug in current code   OR   STATUS: BUGS — <worst>
```
Ruthless + honest. If genuinely clean, say CLEAN (that's how we converge — we need 3 in a row).
