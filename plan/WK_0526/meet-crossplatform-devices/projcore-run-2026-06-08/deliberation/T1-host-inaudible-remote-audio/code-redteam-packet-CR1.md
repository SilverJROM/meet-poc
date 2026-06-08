# CODE RED-TEAM — round CR1 — the IMPLEMENTED diff (not the design)
# (Your role = the model you run as.)

## What changed (read the ACTUAL files + the diff)
The remote-audio playout was reimplemented per design v2.2. Files to READ (real code, on disk now):
- frontend/src/app/services/remote-audio.service.ts  (the per-publisher registry: addPublisher/removePublisher/clearRegistry/syncPeers/unlock/volume/mute/recovery/playoutDiagnostics)
- frontend/src/app/pages/room/room.page.ts  (syncPeers→registry wiring, banner, recovery/visibility/pageshow/keepalive rewire, applySpeakerDevice, buildDiagnosticsPayload)
- frontend/src/app/services/sfu-client.service.ts  (bindSubscribedMid reclaim-safe guard ~L1692; media-playout capture ~L766)
- frontend/src/app/services/meeting-sessions.service.ts  (RemoteAudioPlayoutDiagnostics type)
- frontend/src/app/pages/diagnostics/diagnostics.page.ts(.html)
- frontend/src/app/components/tile/tile.component.ts(.html) (tile audio REMOVED), controls-bar (volume cap 1.0)
Full unified diff: ../IMPL-prod-diff.patch (also `git diff` in repo).
Design contract: consensus-r4-registry.md (v2.2, B1-B22). Root cause: jrom-evidence-addendum.md / round1-synthesis.md.

## Requirement (the bar)
Host hears EVERY remote publisher's audio on a real cross-platform/intl call, on the SELECTED output device, ALL concurrent talkers, app never suppresses a voice; and a future call's diagnostics prove decode-vs-sink. Prior FIX1-5 passed review and STILL failed live — so hunt the CODE, not the prose.

## Your task — find REAL bugs in the IMPLEMENTED code (evidence at file:line)
1. **addPublisher correctness/races:** ordering (sink-before-play), the generation/disposed guard re-checks after each await, the dedup (removePublisher first), listener leaks (are play/playing/pause/ended/error listeners removed on destroy?), the blocked-state machine (does it ever get stuck blocked=true or stuck false?).
2. **syncPeers diff:** does it correctly add/remove/replace by publisher id AND react to live-audio-track-id change (publisher unmuting mid-call → new track)? Any peer left without an element? Any element left after a peer leaves?
3. **Regressions from removing the mixer:** do volume(), setVolume, setMutedAll, mute-all, the recovery hooks (recoverRemoteAudio 'effect'/'interaction'/'visibility'/'keepalive'), pageshow, the voice watchdog, applySpeakerDevice, and the unblock banner/Enable-audio button ALL still function against the registry? Any dangling reference to the deleted mixer graph (gain/limiter/destination/outputElement/bindOutputElement)? Dead code / unused imports / broken signals?
4. **Banner / silent-no-banner:** is there any code path where a live publisher is inaudible but remoteAudioBlocked stays false (the original bug)?
5. **mid-guard (sfu-client):** can bindSubscribedMid ever (a) orphan a live publisher, (b) permanently strand the incoming publisher, (c) throw on a legitimate idempotent re-bind? Trace rollback + retry.
6. **Diagnostics:** does playoutDiagnostics()/media-playout capture actually populate, and is it backward compatible (optional)? Any crash if registry empty?
7. **Tests:** do the added specs actually assert OUTCOMES (sink-before-play, dedup, late-joiner play, banner) or just call methods? Any missing critical case? Is removing feedback-limiter.spec.ts leaving any dangling reference?

## Output — write `<role>-coderedteam-CR1.md` in this dir:
```
# <role> CODE red-team CR1
## Bugs found (table: severity | file:line | what breaks | fix)
## Regressions from the mixer removal (or "none found")
## Silent-no-banner paths in the CODE (or "none")
## Test adequacy gaps (or "adequate")
STATUS: CLEAN — no real bug found in the implemented code
   OR
STATUS: BUGS — <one-line worst bug>
```
Read the REAL code. Evidence at file:line. Be ruthless; this is the gate before it ships to JROM's live app.
