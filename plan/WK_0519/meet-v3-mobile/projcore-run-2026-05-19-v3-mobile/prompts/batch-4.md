# Batch M-B4 — Mobile lobby (camera switch + single-column selectors + AudioContext gesture-gated meter)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree before callback.
**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.**

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B4 (Claude-peer's biggest catch from consult — iOS AudioContext autoplay policy)
**Branch:** `feat/meet-v3-mb4-lobby` — off M-B3 HEAD.

**Requirements assigned:**
- **R3.1** — Camera switch button (`facingMode: 'user'|'environment'`) mobile-only. Assert on the CONSTRAINT OBJECT (`__meetDebug.lastVideoConstraints.facingMode`), NOT track-ID flip (Playwright fake-media doesn't honor facingMode reliably — Claude-peer catch)
- **R3.3** — Single-column lobby device selectors on mobile (vs side-by-side desktop)
- **R3.4 (Claude-peer's critical iOS catch)** — `MediaService.getMicLevel`'s `AudioContext` creation must be **deferred until first user gesture** on mobile/iOS. Lobby shows a "Tap to enable mic preview" pill until tapped; on tap, create AudioContext + `resume()` inside the gesture handler. Desktop unaffected (auto-grants resume).

Read in full:
- `og-requirements.md` (R3)
- `scenarios.md` (S3.1, S3.3, S3.4)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` — R3.4 AudioContext gesture-gated section is the most critical
- Existing `frontend/src/app/components/lobby-preview/*` (target for changes)
- Existing `frontend/src/app/services/media.service.ts` (`getMicLevel` is the function with the iOS bug)

---

## Expected (acceptance criteria)

### Step 1 — AudioContext gesture-gated meter activation (R3.4, the critical one)

The Claude-peer consult flagged this as Run 3's biggest landmine: `MediaService.getMicLevel` currently creates `new AudioContext()` + immediately calls `resume()` during lobby mount. On iOS Safari, `resume()` outside a user-gesture handler silently stays `suspended` → analyser reads zeros → dead meter on real iPhone.

Fix:
- Track an `audioContextActivated = signal(false)` in MediaService (or LobbyPreview component)
- DON'T create the AudioContext on lobby mount. INSTEAD: show a placeholder "Tap to enable mic preview" pill (or similar UX) in the lobby-preview when `audioContextActivated() === false`
- On user tap of the pill: inside the click handler, create `AudioContext` + call `await ctx.resume()` SYNCHRONOUSLY in the gesture handler (iOS quirk: `resume()` must be the first thing in the click stack)
- After resume succeeds, set `audioContextActivated = true` and the meter starts ticking at 8 Hz
- Desktop browsers (Chrome, Firefox) auto-grant resume() regardless of gesture, but the same gesture-gated flow works fine — no need to branch. Apply the gate uniformly.
- If iOS detection (via `platform.isIOS()`) makes you want to special-case: only apply the gate on `platform.isIOS()` (mobile Chrome and Android handle resume() more forgivingly). Codex's call; lean: APPLY UNIFORMLY (simpler, no regression risk on desktop where users won't even see the pill because it auto-resolves on first hover/click).

**Critical:** the pill MUST be inside the lobby-preview component so users see it in the same visual region as the meter. The "tap" can also be the user clicking ANYWHERE in the lobby (e.g. tapping the device selector first); make the gate behavior generous.

### Step 2 — Camera switch button (R3.1)

In `<app-lobby-preview>` component:
- Add a "Flip camera" icon button (Ionicons `camera-reverse` or `sync` or similar)
- Visible only when `viewport.isMobile()` — wrap with `@if (viewport.isMobile())`
- On click: toggle a local `facingMode = signal<'user'|'environment'>('user')` and call `media.reacquire({video: cameraRequested(), facingMode: facingMode()})`
- MediaService.reacquire extended to accept `facingMode` parameter and pass it into the `getUserMedia` constraint:
  ```typescript
  {video: {
    ...(mobile ? mobile480pCaps : {}),
    facingMode: opts.facingMode,
    deviceId: opts.videoDeviceId,
  }}
  ```
- Expose `__meetDebug.lastVideoConstraints.facingMode` for the S3.2 spec to assert
- Note: deviceId + facingMode together may conflict on some browsers; facingMode takes precedence; document via comment

### Step 3 — Single-column selectors on mobile (R3.3)

In `<app-lobby-preview>` SCSS:
- Use `bp.mobile { ... }` to flip the device selector layout from side-by-side (existing) to single-column stack
- Each selector takes full width on mobile, with comfortable spacing

Desktop: existing two-column layout unchanged.

### Step 4 — Tests `e2e/tests/v3-mb4-lobby/`

- `lobby-mobile-camera-switch.spec.ts` (S3.1) — at 390×844: Flip camera button visible; click → `__meetDebug.lastVideoConstraints.facingMode === 'environment'` (or whichever the toggle produces). Assert the CONSTRAINT, not the track ID.
- `lobby-desktop-no-switch.spec.ts` (S3.1 + R8.2) — at 1920×1080: Flip camera button has `toHaveCount(0)`
- `lobby-mobile-selectors-single-column.spec.ts` (S3.3) — at 390×844: `audio` selector's `boundingBox().y + height < video selector's y` (vertical stack)
- `lobby-audiocontext-gesture-gate.spec.ts` (S3.4): at 390×844 (or any viewport):
  - Initial state: `__meetDebug.audioContextActivated === false`
  - "Tap to enable mic preview" pill visible
  - Mic meter bars are all unactive (zeros)
  - Click the pill (or anywhere in lobby)
  - After click: `__meetDebug.audioContextActivated === true`
  - Mic meter starts showing activity within 1s

Run 1 desktop e2e regression at gate (40/40 mandatory).

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-4/`:
1. `changes.md` — full template + AudioContext gate strategy + facingMode handling table
2. `scenarios-implemented.md` (S3.1, S3.3, S3.4)
3. `test-report.md` (backend unchanged + M-B3 regression + M-B4 + Run 1 regression)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — mobile-lobby-with-pill.png, mobile-lobby-after-tap.png, mobile-camera-switch-button.png, desktop-lobby-no-switch.png, mobile-selectors-single-column.png
7. **Decisions:** `decisions/2026-05-19-v3-mb4-<slug>.md` for: gate-uniformly-or-iOS-only, pill placement + copy, facingMode/deviceId precedence

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** drop 5-bar mic meter — DEFERRED to v3.5 (R3.2). Keep current 8-bar implementation; only the activation path changes.
- **DO NOT** implement MediaRecorder mime fallback — M-B5 iOS.
- **DO NOT** modify backend or WebRTC config.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.**

```
STATUS: DONE — M-B4 mobile lobby + AudioContext gesture-gated activation + camera switch + 4 scenarios green + Run 1 regression 40/40
```

— /projcore (Claude, Opus, 2026-05-19)
