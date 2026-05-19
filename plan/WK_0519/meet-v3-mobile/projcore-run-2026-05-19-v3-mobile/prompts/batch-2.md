# Batch M-B2 — Mobile WebRTC adjustments (480p + client-declared mobile + cap-4 + bg-tab)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Verify clean tree before callback.
**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.** Make autonomous calls + log them.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B2 (this is the highest-risk batch per Claude-peer; moved EARLY for debug runway)
**Branch:** `feat/meet-v3-mb2-webrtc` — off the M-B1 HEAD (`d781da5`).

**Requirements assigned:**
- **R5.1** — Mobile preflight requests 480p (`{video:{width:{ideal:854,max:854},height:{ideal:480,max:480}}}`); desktop unchanged
- **R5.2** — Mobile peer cap = 4 via **client-declared `mobile: true` in WS `join` payload** (PRIMARY signal; UA-regex is SECONDARY audit only). **Cap check happens in `join` MESSAGE handler, NOT WS upgrade handler.** Backend stores `isMobile: bool` on PeerEntry at admit.
- **R5.3** — Background-tab BEST-EFFORT pause local video; keep audio (mobile only). Best-effort wording matters: iOS may throttle backgrounded JS/WS; don't promise WS keepalive.
- **R5.5** — Mobile joiner attempts to join when room already at 8 admitted → rejected (per-client cap stacks with global cap; 9th of any kind = no).
- **R5.6** — Backend `isMobile` metadata on PeerEntry; cap check uses `live.admitted` filtered by `isMobile === true` and rejects when that count >= 4.
- **R8.1** — Run 1 desktop e2e regression at gate
- **R8.4** — Desktop video resolution + 8-cap unaffected

Read in full before coding:
- `og-requirements.md` (R5)
- `scenarios.md` (S5.1-S5.5)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` — section on R5.x rewording + the visibilityState test seam
- Existing `backend/src/modules/signaling/index.ts` — `join` handler is where the cap check lands
- Existing `frontend/src/app/services/media.service.ts` — `preflight()` is where the constraint branching lands
- Existing `frontend/src/app/services/ws.service.ts` — `join` payload construction

---

## Expected (acceptance criteria)

### Step 1 — Mobile 480p preflight (R5.1)

`MediaService.preflight()` branches on `viewport.isMobile()`:
- Mobile: `{audio: true, video: cameraRequested ? {width: {ideal: 854, max: 854}, height: {ideal: 480, max: 480}} : false}`
- Desktop: existing behavior (no resolution cap — `{audio: true, video: cameraRequested}` which the browser fills with up to 720p+ defaults)

Expose `__meetDebug.lastVideoConstraints` to the most recently-requested constraint object (a copy) for the S5.1 spec to verify the resolution cap.

Also: `reacquire()` honors the same branching when the user picks a different camera.

### Step 2 — Client-declared `mobile: true` in WS `join` (R5.2, R5.6)

Frontend (`ws.service.ts` or wherever `join` is sent from `room.page.ts`):
```typescript
ws.send(JSON.stringify({
  type: 'join',
  room: roomId,
  name: displayName,
  mobile: this.viewport.isMobile(),   // NEW
}));
```

Backend (`signaling/index.ts` join handler):
- Read `msg.mobile` (boolean coercion: `Boolean(msg.mobile)`)
- Audit log: if `msg.mobile` exists but doesn't match the UA-derived guess, log at info level (telemetry). Trust the client declaration as truth for cap purposes.
- BEFORE admit decision: count mobile peers in `live.admitted`: `const mobileCount = [...live.admitted.values()].filter(p => p.isMobile).length;`
- If joiner is mobile AND `mobileCount >= 4`: send `{type:'error', error:'mobile room full (4 max)'}` + close socket. Do NOT enter pending state.
- Otherwise: proceed with normal admit logic (room-full at 8 still applies — see R5.5)
- Store `isMobile` on the PeerEntry struct that's set into `live.admitted` or `live.pending`.

Add `isMobile` to the PeerEntry shape in `signaling/index.ts`. Pass through to admit / peer-joined broadcasts if needed (probably not — internal use only).

### Step 3 — Global cap stacks (R5.5)

Existing rebuild R3.8: room full at 8 admitted, 9th rejected with `room full (max 8)`. Verify this STILL fires when mobile cap is the limit:
- Room has 4 mobile + 4 desktop = 8 admitted. 9th joiner of ANY platform → `room full (max 8)` error.
- Room has 4 mobile + 3 desktop = 7 admitted. 5th mobile joiner → `mobile room full (4 max)`. A desktop joiner could still get in (would make 4 mobile + 4 desktop = 8).

The 8-cap check should come AFTER the mobile-cap check in the join handler (mobile-cap is more specific).

### Step 4 — Background-tab best-effort pause (R5.3)

In `room.page.ts` (or a dedicated `mobile-lifecycle.service.ts`):
- ONLY on `viewport.isMobile() === true` AND `state === 'in-call'`:
  - Listen for `document.addEventListener('visibilitychange', handler)`
  - On `document.visibilityState === 'hidden'`:
    - If local video track is currently enabled: `track.enabled = false`
    - Send `{type:'media-state', mic: <current>, cam: false}` WS broadcast (peers see avatar)
    - Remember the previous `cam` state in a `wasOnBeforeBackground` signal
  - On `visibilityState === 'visible'`:
    - If `wasOnBeforeBackground === true`: re-enable track + broadcast `{type:'media-state', mic, cam: true}`
- On desktop (`isMobile() === false`): listener is NOT installed; current desktop behavior preserved
- Document via comment: "best-effort — iOS may throttle backgrounded JS/WS so the listener firing isn't guaranteed; visible re-acquire is reliable"

### Step 5 — Tests

**Backend** `backend/tests/signaling-mobile-cap.test.ts` (new):
- S5.3: 4 mobile peers admitted (via `ws` clients sending `{join, mobile:true}`); 5th mobile join → 'mobile room full (4 max)' error
- S5.5: 4 mobile + 3 desktop admitted; 5th mobile = mobile cap rejection; 5th desktop = admitted; then 9th total any-platform = 'room full (max 8)'

**E2E** `e2e/tests/v3-mb2-webrtc/`:
- `mobile-constraints.spec.ts` (S5.1): at 390×844, lobby mounts → `__meetDebug.lastVideoConstraints.video.width.max === 854`
- `desktop-constraints.spec.ts` (S5.2 + R8.4): at 1920×1080, lobby mounts → `lastVideoConstraints.video.width` is undefined or > 854 (NOT capped to 480p)
- `mobile-cap-rejection.spec.ts` (S5.3): 4 ephemeral ws clients with `mobile:true` admit; real Playwright at 390×844 tries to join → sees the "mobile room full" error
- `background-tab.spec.ts` (S5.4): at 390×844, in call with camera on; `Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true})` then dispatch `visibilitychange` event → local video track disabled within 1s + `media-state {cam:false}` broadcast received by a second-context observer
- `background-tab-desktop.spec.ts` (S5.5/R8.4): at 1920×1080, same trigger → local video stays enabled

**Run 1 desktop regression** at gate: 40/40 with `--workers=1`.

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-be meet-poc-fe   # BE has signaling changes
```

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-2/`:
1. `changes.md` — full template + WebRTC constraints table + UA-vs-client-declared decision summary
2. `scenarios-implemented.md` (S5.1-S5.5)
3. `test-report.md`
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — mobile-480p-constraint-debug.png, desktop-720p-constraint-debug.png, mobile-room-full-error.png
7. **Decisions:** `decisions/2026-05-19-v3-mb2-<slug>.md` for: how UA audit telemetry is logged, exact 480p constraint shape, whether bg-tab listener is in room.page or a service

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement bottom-sheet, mobile grid variants, screen-share-hidden — M-B3.
- **DO NOT** implement camera switch or lobby mobile layout — M-B4.
- **DO NOT** implement MediaRecorder fallback — M-B5.
- **DO NOT** modify recording flow.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.**

```
STATUS: DONE — M-B2 WebRTC mobile adjustments + 5 scenarios green + Run 1 desktop regression 40/40
```

— /projcore (Claude, Opus, 2026-05-19)
