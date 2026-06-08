# CODE RED-TEAM — round CR8 — lens L8: adjacent-feature regression sweep
# (Your role = the model you run as.) STREAK 0/3 — fresh lens (NOT structural/concurrency/input/observability/state-machine).
## Context
6 fix rounds heavily edited room.page.ts, remote-audio.service.ts, sfu-client.service.ts. CR-fix-6 just unified the blocked-state derivation. This round checks: did the remote-AUDIO changes REGRESS any ADJACENT feature that shares these files/state? + re-verify the just-landed consistency fix holds.
## READ the CURRENT files + ../IMPL-prod-diff.patch.
## Your task — lens L8 (evidence file:line)
1. **Recorder/recording:** the recorder has its OWN AudioContext (independent). Confirm NOTHING in the audio changes altered what the recorder captures (local + remote mix). Does it still get remote audio for recording now that remote audio is per-publisher `<audio>` elements (not a mixer)? If recording captured the OLD mixer output, is that path still intact OR correctly sourced? (sfu/recorder.service.ts, room.page recorder wiring.)
2. **Transcripts / speaker frames:** any dependency on the removed mixer / outputPlaying / remoteAudioMixer? Still functional?
3. **Screen-share:** remoteScreenStreams handling — did the subscribe rollback/mid-guard/registry changes affect screen audio/video subscribe? Share-layout tiles still render correctly without the removed tile audio element?
4. **Lobby self-test / mic preview / input-device selection:** the device-selection effects + applySpeakerDevice now route to the registry; did INPUT (mic/cam) device selection, lobby self-test, or mic-energy/active-speaker regress? (active-speaker is UI-only analyser — still works?)
5. **The watchdog / keepalive / interaction-recovery** were rewired to the registry — do they still fire on the right lifecycle events and not double-fire or leak timers?
6. **Re-verify CR7 fix:** does remoteAudioBlocked (632, derived from remoteAudioBlockingReason) now AGREE with blockedReason across the state product? Any residual stuck/lying state? selectedSpeakerUnavailable reset confirmed?
7. Any NEW regression or anything prior lenses missed.
## Output `<role>-coderedteam-CR8.md`:
```
# <role> CODE red-team CR8 (lens L8: adjacent-feature regression)
## Per-feature: recorder / transcripts / screen-share / lobby+input-device / watchdog — OK or regression (file:line)
## CR7 consistency fix re-verify: holds or gap
## NEW bugs (table) or "none"
STATUS: CLEAN — no regression, consistency holds   OR   STATUS: BUGS — <worst>
```
Different lens than CR1-7. Honest CLEAN if clean.
