# Consultation: Background effects not visually applying

JROM is reporting blur / image background tiles select correctly in the picker but the camera feed stays raw. He has tested on real Chrome (real camera, real network) at https://voice.silverjrom.app. Console shows a single TypeError on click. Please diagnose root cause from first principles. Don't trust my hypothesis — verify against the code.

## Symptoms (verbatim from JROM's screenshot)

- Click Blur in lobby picker → tile gets selection ring → camera preview unchanged
- Console error:
  ```
  TypeError: c[m] is not a function
      at main-XVEPWZBJ.js:27:141
      at Array.map (<anonymous>)
      at kt (main-XVEPWZBJ.js:27:79)
      at cr.mode.set [as name] (main-XVEPWZBJ.js:28:311)
      at lt.setProperty (chunk-OBXXKJMY.js:1:6868)
      ...
  <ion-icon ... name="videocam-outline">
  ```
- WebGL context created OK, MediaPipe wasm init OK (3 INFO messages from selfie_segmentation)

## What works

- Headless playwright with `fake_device_0` (solid-green frame) shows segmentation actually rendering visually onto canvas; composite stream is produced (effTrackId !== rawTrackId per `window.__meetDebug`)
- Backend build, frontend ng build clean
- Existing 16 fixloop-banner specs pass

## What I changed today after the original "DONE" claim

1. Bundled MediaPipe model + WASM into `frontend/src/assets/mediapipe/` via `angular.json` `assets` glob (was loading from `cdn.jsdelivr.net`)
2. `scripts/serve.js` — added MIME map (`.wasm → application/wasm`, plus image/font types) — was serving everything except html/js/css as `application/octet-stream`
3. `background-picker.component.ts select()` — after `setMode`, if `backgroundEffects.mode() === 'none'` revert `selectedId` to 'none' (UI was lying about active mode when model failed silently)
4. Picker HTML — surface `backgroundEffects.lastError()` as a visible "Background effects unavailable: …" message
5. `lobby-preview.component.{ts,html,scss}` — collapsed picker behind a "Background ▸" toggle (per JROM's second ask)
6. `background-effects.service.ts` — wrapped the rAF loop + `model.send()` + `model.onResults()` in `NgZone.runOutsideAngular` to prevent per-frame change detection

None of these landed the fix. JROM sent two screenshots after the work — same symptom.

## Files to read carefully

- `frontend/src/app/services/background-effects.service.ts` — segmentation service (lazy load MediaPipe, canvas composite, captureStream)
- `frontend/src/app/pages/room/room.page.ts` line ~290–350 + ~860–900 — `effectiveLocalStream` computed signal + `effectiveStreamForSourceTrack()` helper + SFU sync `effect()`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.{ts,html}` — lobby preview binds `[stream]="effectiveLocalStream()"` to a `<video>` element via `effect()`
- `frontend/src/app/components/background-picker/background-picker.component.{ts,html}` — picker
- `frontend/src/app/pages/room/room.page.html` lines ~358, ~410, ~421 — lobby integration + the two ion-icon `[name]` bindings that throw

## My current hypothesis (you should challenge this)

The TypeError is from `<ion-icon>` (Stencil component, `ionicons@7.4.0`) during Angular property binding for `[name]="cameraRequested() ? 'videocam-outline' : 'videocam-off-outline'"`. The throw aborts the change-detection tick that was triggered by the user's click event. That aborted tick MIGHT be the one that would have propagated `effectiveLocalStream()` → lobby-preview's `[stream]` input → the effect that sets `video.srcObject`.

After my zone fix, the error still fires once per click (because the click handler runs inside zone). Maybe one tick is enough to break the propagation.

But this is speculative. Two things bug me:
- `cr.mode.set [as name]` is V8's name for the call site. `cr` is likely a component, `mode` a signal property, `.set` the signal's set method, `[as name]` means the function got attached to a `name` property somewhere. The only `mode` signal in the codebase is `BackgroundEffectsService.mode`. Why is its setter being invoked from Angular's `setProperty` for an ion-icon name? Could be V8 misattribution. Could be a real linkage I'm missing.
- The Array.map at `kt` — what is being mapped? Likely Angular's internal binding-update list.

## Asks

1. **Read the code** and tell me what's actually wrong. Is the ion-icon TypeError the cause or a red herring? Is the lobby-preview signal-binding actually wired correctly? Is there a missing reactive trigger when the canvas captureStream starts producing frames vs when the signal updates?
2. **Reproduce the failure** if you can (`pm2 status` shows meet-poc-fe online on port 4700, dev URL https://voice.silverjrom.app). Optional: write a quick playwright spec to load the lobby, click Blur, dump console errors + check `window.__meetDebug` state + check `document.querySelector('app-lobby-preview video').srcObject.id` to see if srcObject ever switches to the composite stream.
3. **Propose a fix** with a clear reason. We agree on it before any more edits. Don't shotgun multiple changes like I did.

## State

Working tree has uncommitted changes from my failed attempts (run `git diff` to see). If the right fix needs different changes, I'll revert mine.

Reply with: ROOT CAUSE, PROPOSED FIX, OPEN QUESTIONS (if any).
