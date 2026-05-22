# Correction — B6b iter 1 (VALIDATED-FAIL by codex)

Codex independent validation FAILED B6b. Two specific gaps — fix ONLY these:

## Gap 1 (BUG): updateCameraLayer sends an EMPTY mid → server rejects
- `__meetDebug.sfuUpdateCameraLayer()` → `doUpdateCameraLayer` issues `PUT /api/sfu/tracks/update` with a track whose **`mid: ""`** (empty string). The server/CF rejects it (HttpErrorResponse).
- Evidence: the PUT carried correct `preferredRid:'h'` + `ridNotAvailable:'degrade'` but `mid: ""`.
- ROOT CAUSE to find + fix: how are you resolving the subscribed REMOTE camera track's mid(s)? The mid you send to `/api/sfu/tracks/update` must be the real transceiver/track mid of the subscribed camera track (the one CF assigned on subscribe, stored in your subscribedTracks/midToEntry model from B4a). It's currently empty — investigate whether (a) the mid isn't being captured/stored on subscribe for camera tracks, (b) updateCameraLayer reads the wrong field/map, or (c) it's iterating tracks that have no mid yet. Fix so the PUT carries the correct non-empty mid(s) for the camera tracks being updated.

## Gap 2 (TEST GAP): the e2e passed despite the rejected request
- Your e2e asserted the captured PUT request BODY had `preferredRid:'h'` — but NOT that the update SUCCEEDED. So a server-rejected empty-mid PUT still satisfied the assertion. That's why your run was green while codex's failed.
- STRENGTHEN the e2e: after calling `updateCameraLayer()`, assert (a) it resolves WITHOUT throwing, (b) the PUT `/api/sfu/tracks/update` response is 2xx (ok), and (c) inbound video still flows (framesDecoded keeps advancing) — i.e. the update neither errors nor breaks the stream. This must catch the empty-mid failure codex hit.

## Preserve (do NOT redo)
- The subscribe-time preferredRid logic (desktop 'h' / mobile 'l') and the cameraRidNow/screenshare-override are CORRECT — codex confirmed the subscribe request preferences pass. Leave them.
- Keep all other batches intact.

## After fixing
Re-run the layer-pref e2e (it must now genuinely exercise + pass the update) + the B4a/B6a regressions. Callback FIRST `[projcore callback] B6b DONE ...`, commit before STATUS: DONE. If the empty-mid root cause turns out to be a backend/CF contract issue (the mid isn't available client-side at update time), STATUS: BLOCKED with the specifics rather than guessing.
