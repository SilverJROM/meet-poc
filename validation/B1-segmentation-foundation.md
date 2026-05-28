# B1 Segmentation Foundation Validation

## Files touched
- `frontend/package.json`
- `package-lock.json`
- `frontend/src/app/services/background-effects.service.ts`
- `frontend/src/app/services/media.service.ts`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.ts`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.html`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.scss`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `validation/B1-blur-preview-screenshot.png`
- `validation/B1-segmentation-foundation.md`

## Library
- Package: `@mediapipe/selfie_segmentation`
- Version: `0.1.1675465747`
- Rationale: follows north-star D1 and provides the classic `SelfieSegmentation` browser API needed for canvas mask compositing. The package is CommonJS-shaped at runtime, so the dynamic import handles the `default` export wrapper.

## Public API
- `setMode(next: 'none' | 'blur' | 'image'): Promise<void>`
- `setBackgroundImage(source: HTMLImageElement | string): Promise<void>`
- `processStream(input: MediaStream): MediaStream`
- `dispose(): void`

## Wiring
- `RoomPage.effectiveLocalStream()` derives one local stream for self-view/lobby preview from `media.localStream()` plus `BackgroundEffectsService.mode()`.
- When effects are active, `processStream()` returns a canvas capture stream and `RoomPage` combines that video track with the original audio tracks.
- Local lobby preview and the local in-call peer both bind to `effectiveLocalStream()`.
- SFU publish uses `effectiveLocalStream()` when joining, and later mode/camera changes call `replaceVideoTrack()` with the effective video track.
- Camera replacement in `MediaService.replaceVideoTrack()` now removes the old camera track before invoking the replacement callback so the processor and SFU sender see the same new source track.

## Risk treatment
- SFU renegotiation: `SfuClientService.replaceVideoTrack()` remains queued through its existing `enqueue()` path; B1 only changes the track passed into that existing API.
- Camera flip/device replacement: effective-track derivation is based on the current `media.localStream()` track after replacement, avoiding old-camera compositing.
- Screen share: own screen share is left alone; background-effect sender sync skips replacement while `media.screenOn()` is true.
- Model load failure: `BackgroundEffectsService` sets `lastError`, logs a warning, forces `mode='none'`, and returns the raw input stream from `processStream()`.

## Evidence
- `cd backend && npm run build`: PASS.
- `cd frontend && npx ng build`: PASS. Warnings: existing Stencil empty glob; MediaPipe CommonJS optimization bailout.
- Manual blur preview: PASS. Screenshot saved at `validation/B1-blur-preview-screenshot.png`; raw and effective video tracks were different live tracks.
- Manual two-browser join: PASS. Host joined with blur enabled; guest received a live remote host video track.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line`: PASS, 16/16.

## Perf cost observed
- Successful preview validation completed within the 30s guard including model load, room setup, and screenshot capture.
- Browser console emitted MediaPipe/WebGL `ReadPixels` performance warnings during processing; no join, preview, or e2e regression failure was observed.
