# Batch v2-B5 — Frontend: lobby device preview (Pattern X)

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B5
**Branch:** `feat/meet-v2-b5-lobby-preview` — off B4 HEAD.

**Requirements assigned:**
- **R5.1** — Lobby pre-grants `getUserMedia` on mount (Pattern X)
- **R5.2** — Mic level meter + device selector dropdowns
- **R5.3** — Device-change re-acquires `getUserMedia` with new deviceId
- **R5.4** — Test-mic playback (optional polish — codex may skip with logged reason)
- **R5.5** — Pre-acquired stream carries into call (no second getUserMedia)

Read before coding:
- `og-requirements.md` (R5 section)
- `scenarios.md` (S5.1-S5.5)
- `context-handoff.md` (post-B4 state + Pattern X spec)
- Existing: `frontend/src/app/services/media.service.ts`, `frontend/src/app/pages/room/room.page.ts`

---

## Expected (acceptance criteria)

### MediaService extensions

Add to `media.service.ts`:

```typescript
type MediaError = { code: 'denied' | 'no-devices' | 'unknown'; message: string };

async preflight(constraints: { audio: boolean; video: boolean }): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw { code: 'denied', message: 'Media permission denied' };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw { code: 'no-devices', message: 'No devices found' };
    }
    throw { code: 'unknown', message: String(err?.message || err) };
  }
}

async enumerateDevices(): Promise<{audioInputs: MediaDeviceInfo[], videoInputs: MediaDeviceInfo[]}> { … }
async reacquire(opts: { audioDeviceId?: string; videoDeviceId?: string; video: boolean }): Promise<MediaStream> { … }
```

**Mic level signal**: new method `getMicLevel(stream: MediaStream): Signal<number>` that:
- Creates an `AudioContext` (one per service, lazy-init).
- `analyser = ctx.createAnalyser()`; `analyser.fftSize = 512`.
- `source = ctx.createMediaStreamSource(stream); source.connect(analyser)`.
- `setInterval(125)` (= 8 Hz) reads `analyser.getByteTimeDomainData(buf)`, computes RMS (normalized 0-1).
- Returns a signal updated on each tick. Cleanup on `reset()`.

### Components

**`<app-mic-meter>`** at `frontend/src/app/components/mic-meter/`:
- `@Input() level = signal<number>(0)`.
- Template: 8 vertical bars (`<div class="bar" [class.is-active]="level() > i/8" *ngFor="let i of [0..7]">`).
- SCSS: bars stack horizontally, height grows with `i`, smooth `transition: opacity 80ms`.

**`<app-lobby-preview>`** at `frontend/src/app/components/lobby-preview/`:
- Inputs: `stream`, `audioInputs`, `videoInputs`, `selectedAudioId`, `selectedVideoId`, `videoEnabled` (bool).
- Outputs: `audioDeviceChange(id)`, `videoDeviceChange(id)`.
- Layout: video element top (showing the preview, or "Camera off" placeholder), mic-meter below, two `<select>` dropdowns at bottom for mic + camera.
- Wire `stream → videoElement.srcObject` via Angular `@ViewChild` lifecycle.

### Room page wiring

In `room.page.ts`:
- On `state === 'lobby'` (after `roomTitle` is set): call `media.preflight({audio:true, video: cameraRequested()})`. Store in `localStream = signal<MediaStream|null>(null)`. Set `permissionError = signal<'denied'|'no-devices'|null>(null)` on failure (UI for these states is B7's full polish, but B5 sets the signal so B7 can render).
- After preflight success: call `media.enumerateDevices()`, store in `audioInputs` + `videoInputs` signals; pick first as default `selectedAudioId` + `selectedVideoId`.
- Render `<app-lobby-preview>` in the lobby template.
- On device change emit → call `media.reacquire({...selectedIds, video: cameraRequested()})` → update `localStream`.
- On `cameraRequested` checkbox toggle → call `reacquire` with new `video` value.
- On Join: pass `localStream` to the existing connecting flow. **DO NOT call getUserMedia again**.

In `room.page.html`:
- Insert `<app-lobby-preview [stream]="localStream()" ... />` between the room title and join form in the `lobby` state.
- Existing knock spinner / form remains.

### `__meetDebug` window hook

Expose `(window as any).__meetDebug.localStream = stream` whenever `localStream()` changes. Used by S5.1 + S5.5.

### Permission-denied UI placeholder

When `permissionError() === 'denied'`: render a simple error block above the join form:
```
⚠ Microphone access denied — meet-poc can't join this call. Check browser settings → allow microphone for voice.silverjrom.app, then click Retry.
[Retry]
```
The Retry button re-invokes preflight. **Full polish (better copy, no-devices variant, mid-call denial) is B7 (R7.4).** B5 just wires the basic Retry → preflight loop so S5.4 passes.

### Test-mic playback (R5.4 — optional)

If easy: add a "Test mic" button in lobby-preview that records 1s via MediaRecorder, then plays back via an `<audio>` element. If complicates the Playwright test setup or adds >50 LOC, skip + log in decisions/.

### Tests `e2e/tests/v2-b5-lobby/`

- `lobby-preflight.spec.ts` (S5.1): navigate to `/room/<TEST_ROOM01_id>` (or seeded room), check `window.__meetDebug.localStream.getAudioTracks().length > 0` within 2s.
- `lobby-mic-meter.spec.ts` (S5.2): observe `<app-mic-meter>` for 2s, at least 1 `.bar.is-active`.
- `lobby-device-selector.spec.ts` (S5.3): click mic selector, options.length >= 1.
- `lobby-permission-denied.spec.ts` (S5.4): launch Playwright with browser `permissions: []` override (no auto-grant). Lobby shows the denied error message + Retry button.
- `lobby-stream-carries.spec.ts` (S5.5): note track IDs of `localStream` in lobby; click Join (note: needs the room owned by the auth'd user so it auto-admits without a knock). After `state === 'in-call'`, track IDs match.

Playwright config: `e2e/playwright.live.config.ts` already has fake-media flags; verify they work for B5 + add a separate config (or use `use: {launchOptions: {args: [...]}}` override) for the permission-denied case.

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify https://voice.silverjrom.app/room/<some-room> lobby shows the preview.

## Required artifacts

`projcore-run-2026-05-19-v2/batch-5/`:
1. `changes.md` (full template + MediaService extension summary)
2. `scenarios-implemented.md` — S5.1-S5.5 (S5.4 optional polish — note if skipped)
3. `test-report.md` — backend regression + B3+B4 regression + B5 targeted
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — lobby with camera-on preview + meter + selectors, lobby camera-off (placeholder + meter), permission-denied state
7. **Decisions:** `decisions/2026-05-19-v2-b5-<slug>.md` for test-mic decision, mic-bar threshold, Retry implementation strategy

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement the call-side overhaul (B6).
- **DO NOT** change recording or signaling (B6/B7/B8).
- **DO NOT** add Settings tab content (Run 2).
- **DO NOT** modify backend.

## Completion protocol

Commit BEFORE STATUS: DONE.

```
STATUS: DONE — v2-B5 lobby device preview + 5 scenarios green + live verified
```

— /projcore (Claude, Opus, 2026-05-19)
