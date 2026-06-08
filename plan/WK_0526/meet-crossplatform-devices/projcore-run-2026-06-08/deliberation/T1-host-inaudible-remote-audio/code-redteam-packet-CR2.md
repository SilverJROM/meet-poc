# CODE RED-TEAM — round CR2 — the corrected diff
# (Your role = the model you run as.)

## Context
CR1 found real bugs; CR-fix-1 fixed them. Verify the fixes AND hunt for NEW bugs/regressions in the CURRENT code.
CR-fix-1 changed:
- P0 silent-no-banner: new per-publisher `voiceStalled` state; the voice watchdog's bytes-climbing/emitted-flat verdict now latches `remoteAudioBlocked` (banner) via recoverVoicePlayout→setVoiceStalled(true); cleared only by noteVoiceEmissionAdvanced when jitterBufferEmittedCount advances (room.page.ts:2733-2772, remote-audio.service.ts:254-263,507-518).
- Subscribe rollback now snapshots+restores remoteStreams/remoteScreenStreams (sfu-client.service.ts).
- Diagnostics: mediaPlayout rendered call-wide; per-publisher inbound totalAudioEnergy added.
- reset() clears unlocked + selectedSinkId.
- Dead mixer-era code removed.

## READ the ACTUAL files (on disk) + ../IMPL-prod-diff.patch. Design contract: ../consensus-r4-registry.md (B1-B22).

## Your task — find REAL bugs in the CURRENT code (evidence file:line)
1. Re-attack the P0 latch: can voiceStalled get STUCK true (banner never clears) — e.g., emitted never advances because the publisher is legitimately silent (micSilent)? Does a legitimately-silent remote (not talking) wrongly trip the stall→banner? Trace remoteVoiceBytesClimbed/decideVoiceRecovery: bytes climb from RTP keepalive even when silent? Could this FALSE-banner on a quiet participant?
2. The rollback streams restore: correct snapshot/restore ordering? Any case it removes a LEGIT concurrent publisher's stream?
3. Per-publisher energy: does inbound totalAudioEnergy populate per-publisher and is it actually per-track (not call-wide)?
4. reset() hygiene + any remaining dead code / dangling ref.
5. syncPeers track-replace, dedup, late-joiner, banner — still correct after the changes?
6. Any NEW silent-no-banner path, race, or regression introduced by CR-fix-1.

## Output — write `<role>-coderedteam-CR2.md`:
```
# <role> CODE red-team CR2
## CR-fix-1 verification: P0-latch / rollback / per-pub-energy / reset — each OK or gap
## NEW bugs found (table: severity|file:line|what|fix) or "none"
## False-positive banner risk (silent participant): real or safe? (file:line)
STATUS: CLEAN — no real bug in current code   OR   STATUS: BUGS — <worst>
```
Ruthless + honest. This is the gate before JROM's live app.
