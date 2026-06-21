BATCH B02 — deviceId fallback ladder on ALL acquire paths (P0.1: A1/A2/A10). PLAN HANDSHAKE FIRST (no code until APPROVED-PLAN).

Foundation already built (B01, committed): frontend/src/app/services/media-acquisition.ts exports acquireAudio/acquireVideo (fallback ladder exact→ideal→default→(video)none) + a single-flight queue; media.service has `this.acquisitionQueue` and preflight() already routes through it. Read media-acquisition.ts + media.service.ts to see the pattern.

THIS BATCH: route the REMAINING capture acquire paths through acquireAudio/acquireVideo(this.acquisitionQueue, …) so deviceId:{exact} can NEVER hard-fail on a device whose saved id doesn't match (Android/PC/external). Paths to convert (still using raw getUserMedia with {exact}):
- media.service.ts: reacquire(), replaceAudioTrack(), replaceVideoTrack(), the toggleMic()/toggleCamera() acquire branches.
- After a fallback that lands on a DIFFERENT device than requested, update the selected id to the actually-acquired track's deviceId (reuse the spirit of device-selection.ts resolveSelectedAudioId) so the picker reflects reality + storage isn't pinned to a dead id (A8/A9 adjacent — but keep this batch focused on the acquire+fallback wiring).
- Preserve acquire-before-destroy in the replace paths (don't stop the old track until the new one is live — B01's commit pattern / replaceTrack semantics).

PROPOSE (reply PROPOSED, WAIT): the exact call sites converted, how the fallback result updates selected id, acquire-before-destroy handling per path, the unit test additions (the ladder is already specced; add cases for the selected-id-after-fallback decision if you extract one), files, risks, no-regression (mic-persist, audio-playout, camera-in-call must still work), complexity. End STATUS: PROPOSED — <one-line> · complexity: <tier>. 
Proof: unit (npx tsx) + ng build green; fake-media e2e CANNOT prove acquisition. 
FIRST append callbacks.md: [projcore callback] B02 PROPOSED <one-line> (on reply); on completion [projcore callback] B02 DONE <one-line>.
