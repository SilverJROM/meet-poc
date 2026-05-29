# Batch B — Speaker mute + volume slider + amplifier

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc-38-audio-fix` and watching this session (`lkvc-38-audio-fix-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md — those are projcore's. Just implement the scope below in THIS session and emit `STATUS: DONE — Batch B ready for validation` when finished.

## Scope

### B1 — Speaker mute toggle
File: `frontend/src/app/services/remote-audio.service.ts`

Add a `mutedAll: signal(false)` and a `setMutedAll(value: boolean)` method that sets `this.gain.gain.value = value ? 0 : this.volume()` (where `volume` is the new signal from B2). Local mic-mute is separate.

File: `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html}`

The "speaker" button in controls (find it; it's near the volume / device controls) becomes:
- Single click → toggle `mutedAll`
- Visual state: icon flips between `volume-high-outline` and `volume-mute-outline`
- When `mutedAll === true`, button has a `.muted` class with red tint

If your call has BOTH mic muted AND speaker muted, show a combined indicator (e.g., red dot on the controls-bar or a small "🔇 + 🎤" overlay on the local self-view tile). Implementer choice on placement — keep it understated.

### B2 — Volume slider + amplifier
File: `frontend/src/app/services/remote-audio.service.ts`

Add:
```ts
readonly volume = signal(1.0);  // 0..1.3 (1.0 = 100%, 1.3 = +30% amplifier)
setVolume(value: number): void {
  const clamped = Math.max(0, Math.min(1.3, value));
  this.volume.set(clamped);
  if (this.gain && !this.mutedAll()) this.gain.gain.value = clamped;
}
```

When user adjusts volume, `setVolume` updates the GainNode in real time. `mutedAll` overrides — when muted, gain is 0 regardless of `volume` value.

File: `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html,scss}`

Add a small expandable volume control:
- Speaker icon (single click → mute toggle from B1)
- Long-press OR a small caret chevron next to speaker → opens a popover with a vertical slider (0–130%)
- Slider has a visible marker at 100% (the "normal" max) so user understands +30% is amplifier territory
- Show current value as text (e.g., "85%" or "115% (amp)")
- Popover dismisses on outside-click or escape

Implementation: use a small floating div positioned above/beside the speaker button. Native `<input type="range">` styled to match the app.

### B3 — Persist volume across sessions
Store volume in localStorage: `meet-poc:volume:value`. On `RemoteAudioService` init, read and call `setVolume(stored ?? 1.0)`. On every `setVolume`, persist.

`mutedAll` should NOT persist — fresh each session (would be confusing if you join a call and audio is silently muted).

## Hard constraints
- ONLY touch `remote-audio.service.ts`, controls-bar component files, `room.page.{html,ts}` if needed to wire the new service signals.
- Do NOT change the WebAudio graph topology (still GainNode → MediaStreamAudioDestinationNode → audio element).
- Slider range MAX is `1.3` (130%). Don't let users go higher — risks clipping/distortion.
- Mute button click is a single discrete tap. Avoid accidental triggers from drag/long-press paths.
- DO NOT modify projcore-owned artifacts: queue.md, progress.md, req-matrix.md, context-handoff.md, callbacks.md, north-star.md, og-requirements.md. Only write to `validation/B-audio-controls.md` for your validation note.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — ALL PASS.
4. Optional: new playwright spec asserting volume signal updates GainNode. Skip if access to `window.__meetDebug.remoteAudioMixer` is too convoluted.
5. Write `validation/B-audio-controls.md`.
6. Commit: `feat(audio): speaker mute toggle + volume slider with +30% amplifier`.

Final line MUST be: `STATUS: DONE — Batch B ready for validation`.
