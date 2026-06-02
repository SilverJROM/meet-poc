# Scenarios: Batch B1 — In-call mic AND camera always enable-able; never stiff

**Branch:** `feat/incall-media-always-enableable-20260602`
**Requirements:** `og-requirements.md` § RC (acceptance 1-5)
**Scope:** mic + camera in-call enable from off/absent state, never-stiff (controls never disabled by pre-join permission state), NotAllowedError non-blocking hint. NOT B2 feedback suppression.

## Source facts (read before writing — real cites)
- `frontend/src/app/services/media.service.ts:230-236` `toggleMic()` — `const track = localStream()?.getAudioTracks()[0]; if (!track) return false;` → NO-OP when mic absent. **Bug A.**
- `frontend/src/app/services/media.service.ts:249-272` `toggleCamera()` — `const stream = localStream(); if (!stream) return false;` → NO-OP when no local stream at all (line 253-254). **Bug B.** The `existing` flip path (256-261) and the stream-exists-without-video acquire path (263-271) already work — must NOT regress.
- `media.service.ts:98-119` `replaceAudioTrack()` — EXISTING acquire+add+`onAudioTrackChanged`(publish)+`micOn.set`+`startMicLevel` pattern to MIRROR for the mic acquire path.
- `media.service.ts:121-145` `replaceVideoTrack()` — sibling acquire+add+publish+`cameraOn.set` pattern.
- `sfu-client.service.ts:962-973` — publish ALWAYS pre-negotiates BOTH audio + video `sendonly` transceivers even with no track, so `audioSender`/`videoSender` exist post-publish and `replaceTrack` works WITHOUT renegotiation. Parity hook for late acquire.
- `room.page.ts:941-944` `toggleMic()` handler → `media.toggleMic()` + `broadcastMediaState`. `:946-963` `toggleCamera()` handler → `media.toggleCamera(replaceEffectiveVideoTrack, …)`; catch sets `status` (not actionNotice).
- `room.page.ts:2089-2099` `replaceInCallAudio()` — existing `media.replaceAudioTrack(…, (t)=>this.sfuClient.replaceAudioTrack(t))` publish wiring to mirror.
- `room.page.ts:396` `readonly actionNotice = signal<string | null>(null)` — the dismissible banner.
- `room.page.html:200-204` — `@if (actionNotice())` renders `<span>{{ actionNotice() }}</span>` + a `Dismiss` button (`actionNotice.set(null)`).
- `controls-bar.component.html:19-63` — mic button `(click)="mute.emit()"`, camera button `(click)="camera.emit()"`; `[class.is-off]="!micOn()"` / `!cameraOn()`. NEITHER has `[disabled]`. Pre-join checkboxes: `name="cameraRequested"` (`room.page.html:472`), `name="micRequested"`.
- Debug hooks (`room.page.ts:510-511`): `window.__meetDebug.localAudioTrackId`, `.localVideoTrackId` reflect current local track ids (undefined when absent). `sfuPublishState.status === 'published'`, `sfuGetStats()` for inbound RTP.
- **NEW file** to create: `frontend/src/app/services/media-toggle.ts` exporting pure `resolveMediaToggleAction(...)` + `permissionBlockHint(...)`.
- Unit pattern: `frontend/src/app/services/device-selection.spec.ts` — `import assert from 'node:assert/strict'`, import from `./media-toggle.js`, braced assertion blocks, final `console.log('… all assertions passed')`, run `npx tsx media-toggle.spec.ts`.
- e2e harness: `e2e/tests/sfu-b5a-toggles/sfu-toggles.spec.ts` — `loginAsJrom`, `createRoomViaApi`, `?sfu=1`, `#display-name`, role-button Join/Admit, `__meetDebug` polling. fake-media: `--use-fake-ui-for-media-stream` auto-grants. Isolate DB via `MEET_DB_PATH`; never touch `data/meet-poc.sqlite`.

---

## HARD GATE vs SOFT (call out per persona)
- **HARD GATE (must pass for B1 DONE):** S1, S2 — the `npx tsx media-toggle.spec.ts` pure-decision unit test on `resolveMediaToggleAction` + `permissionBlockHint`. Deterministic, no browser, no fake-media flake. Plus the `npx ng build` clean-compile gate (S9).
- **SOFT (best-effort, fake-media-harness-permitting):** S3-S6 e2e (live "remote hears/sees it", late-acquire publish). Fake-media cannot model a true browser `NotAllowedError` "denied" state cleanly, so the NotAllowedError live path (S6) is a **manual localhost note**, not a blocking e2e.
- **MANUAL localhost note (required, both kinds):** S7 — the three rendered states (off-with-stream, no-stream, browser-blocked) for BOTH mic and camera, with screenshots.

---

## S1 — [HARD GATE] resolveMediaToggleAction: acquire-vs-flip decision per media kind
**Roles / Preconditions:** none (pure fn). **Type:** feature (new logic).

### Acceptance Criteria (concrete, assertable)
- `resolveMediaToggleAction` is a pure exported fn in `frontend/src/app/services/media-toggle.ts` taking a plain input (no DOM, no signals) describing: `kind: 'audio' | 'video'`, whether a local stream exists, whether a track of that kind exists, and that track's `enabled` flag.
- It returns a discriminated action: one of `'acquire'` (no stream OR no track of kind → must getUserMedia + add + publish), `'enable'` (track exists, currently disabled → flip enabled true), `'disable'` (track exists, currently enabled → flip enabled false).
- The decision is identical regardless of pre-join permission state — there is NO `'noop'`/`'denied'`/`'blocked'` action in the returned set (proves "never stiff": absence always maps to `acquire`, never a dead-end).

### Steps (assertions in `media-toggle.spec.ts`)
1. `kind:'audio'`, `streamExists:false` → returns `'acquire'`. (mirrors no-localStream camera case + absent-mic case)
2. `kind:'audio'`, `streamExists:true`, `trackExists:false` → `'acquire'`. (joined mic-off/absent → Bug A fix)
3. `kind:'audio'`, `trackExists:true`, `enabled:false` → `'enable'`. (off-with-track flip on)
4. `kind:'audio'`, `trackExists:true`, `enabled:true` → `'disable'`. (toggle back off)
5. `kind:'video'`, `streamExists:false` → `'acquire'`. (Bug B: no-localStream camera case)
6. `kind:'video'`, `streamExists:true`, `trackExists:false` → `'acquire'`. (already-working acquire path — decision unchanged)
7. `kind:'video'`, `trackExists:true`, `enabled:false` → `'enable'`; `enabled:true` → `'disable'`. (existing flip path preserved)
8. Assert the union of all returned values over scenarios 1-7 ⊆ `{'acquire','enable','disable'}` and contains NO blocked/denied/noop member.

### Edge Cases
- `streamExists:false` with `trackExists:true` is incoherent input — fn must still resolve to `'acquire'` (stream is source of truth; defensive, never throws).

### Verification (how reviewer checks)
`npx tsx media-toggle.spec.ts` from `frontend/src/app/services/` exits 0 and prints `media-toggle: all assertions passed`. Reviewer greps the spec for an assertion proving NO blocked/noop action exists (step 8). Symptom-only fix (e.g. fn that just early-returns) REJECTED.

---

## S2 — [HARD GATE] permissionBlockHint: non-blocking unblock hint string for NotAllowedError
**Roles / Preconditions:** none (pure fn). **Type:** feature (new logic).

### Acceptance Criteria (concrete, assertable)
- `permissionBlockHint(kind: 'audio'|'video', err)` is a pure exported fn in `media-toggle.ts`.
- Given a `NotAllowedError` (DOMException-shaped: `{ name: 'NotAllowedError' }`) it returns a NON-NULL, NON-EMPTY string that (a) names the right device word ("microphone" for audio, "camera" for video) and (b) references the address-bar / site-settings unblock affordance (assert substring like `address bar` or `site settings` — case-insensitive).
- Given any OTHER error (e.g. `NotFoundError`, `OverconstrainedError`, generic `Error`) it returns `null` (so the generic `status`/`actionNotice` path handles it — hint is reserved for the genuine hard-block case).
- The returned hint NEVER contains words implying permanence/dead-end ("disabled", "blocked forever", "cannot") — assert it does not match `/disabled|forever/i`. (Proves the "non-blocking, re-attemptable" contract.)

### Steps (assertions in `media-toggle.spec.ts`)
1. `permissionBlockHint('audio', {name:'NotAllowedError'})` → string, includes `microphone` (case-insens), includes `address bar` OR `site settings`.
2. `permissionBlockHint('video', {name:'NotAllowedError'})` → string, includes `camera`.
3. `permissionBlockHint('audio', {name:'NotFoundError'})` → `null`.
4. `permissionBlockHint('video', new Error('boom'))` → `null`.
5. Hint for both kinds does NOT match `/disabled|forever/i`.

### Edge Cases
- `err` undefined/null → returns `null` (no hint, defers to generic path; never throws).
- `err.name` is the Chrome legacy `'PermissionDeniedError'` alias → treated same as NotAllowedError (returns a hint). Assert this alias too.

### Verification (how reviewer checks)
Same `npx tsx media-toggle.spec.ts` run; assertions 1-5 + edge alias present. Reviewer confirms the room handler actually CALLS `permissionBlockHint` and routes its non-null result to `actionNotice.set(...)` (grep `room.page.ts` for `permissionBlockHint` + `actionNotice.set`), so the proven logic is wired, not dead code.

---

## S3 — [SOFT e2e] Joined mic-OFF → in-call mic button acquires + publishes; remote peer media-state flips
**Roles:** 2 clients (A host, B guest) over SFU. **Type:** feature (Bug A fix). **Preconditions:** B joins with mic-OFF pre-join (`name="micRequested"` unchecked), camera on (so B publishes & gets admitted via existing flow).

### Acceptance Criteria (concrete, assertable)
- After B joins mic-off: `B.__meetDebug.localAudioTrackId` is `undefined` (no audio track) AND the mic button is rendered with `.is-off` and is NOT `[disabled]` (assert `button[aria-label="Unmute microphone"]` is enabled).
- B clicks the in-call mic button (`getByRole('button',{name:'Unmute microphone'})`).
- After click: `B.__meetDebug.localAudioTrackId` becomes a non-empty string (a track was ACQUIRED + added) AND `media.micOn` flips true (button now `aria-label="Mute microphone"`, no `.is-off`).
- `B.__meetDebug.sfuPublishState.status` remains `'published'` (replaceTrack on the pre-negotiated audioSender — NO re-publish/renegotiation churn).
- A receives B's media-state update showing B mic-on (roster/participant tile audio-on indicator for B; assert the `.is-off`/muted indicator for B's tile clears, or media-state signal received — whichever the roster exposes).

### Steps
1. A `loginAsJrom`, `createRoomViaApi`, join `?sfu=1` camera-on, wait `sfuPublishState.status==='published'`.
2. B new context → `?sfu=1`, leave `micRequested` unchecked, check `cameraRequested`, Ask to join.
3. A admits B; B `.call-panel` visible; B `waitForPublished`.
4. Assert `B localAudioTrackId === undefined`; assert mic button enabled + `.is-off`.
5. B clicks Unmute microphone.
6. Poll `B localAudioTrackId` → truthy within 8s; assert `sfuPublishState.status==='published'` unchanged.
7. Toggle OFF then ON again → `localAudioTrackId` stays stable (same track id, flip-enabled path), `micOn` flips correctly. (proves "toggling off/on after works" via flip, not re-acquire.)

### Edge Cases
- Audio `framesReceived`/`packetsReceived` is unreliable with fake media (per existing b5a note) — do NOT gate "remote hears it" on inbound audio RTP; gate on media-state signaling + local track presence. True audibility → manual note (S7).

### Verification
`npx playwright test e2e/tests/<b1-incall-media>/…` with `MEET_DB_PATH` isolation. Proof: `localAudioTrackId` undefined→truthy across the click, `sfuPublishState` stays `published`, mic-on signal observed on A. SOFT (fake-media-permitting); failure due to harness audio limits is noted, not a hard fail, provided S1/S2 pass.

---

## S4 — [SOFT e2e] Joined camera-OFF with NO local stream → in-call camera button acquires + publishes; remote peer sees frames
**Roles:** 2 clients (A host, B guest) over SFU. **Type:** feature (Bug B fix — the no-localStream branch). **Preconditions:** B joins with BOTH mic-off and camera-off pre-join (so `localStream()` is null / has no tracks — the exact `if (!stream) return false` dead path).

### Acceptance Criteria (concrete, assertable)
- After B joins fully off: `B.__meetDebug.localVideoTrackId === undefined`; camera button rendered `.is-off`, NOT `[disabled]` (`button[aria-label="Turn camera on"]` enabled).
- B clicks the camera button (`getByRole('button',{name:'Turn camera on'})`).
- After click: `B.__meetDebug.localVideoTrackId` becomes truthy; `cameraOn` true (button `aria-label="Turn camera off"`, `.is-off` cleared).
- `B.sfuPublishState.status` stays `'published'` (replaceTrack on pre-negotiated videoSender, no renegotiation).
- A receives B's video: A's inbound video `framesDecoded` for B's stream advances `> 0` after the click (was 0 before). Use the existing `waitForInboundMedia`/`sampleInboundVideoFrames` helper pattern.

### Steps
1. A joins camera-on, published (as S3.1).
2. B context → `?sfu=1`, leave BOTH `micRequested` and `cameraRequested` unchecked, Ask to join.
3. A admits B; B `.call-panel` visible; B `waitForPublished` (publishes audio+video sendonly transceivers with NO tracks).
4. Assert `B localVideoTrackId === undefined`; camera button enabled + `.is-off`.
5. Sample A's inbound video frames for B == 0 baseline.
6. B clicks Turn camera on.
7. Poll `B localVideoTrackId` truthy ≤8s; `sfuPublishState==='published'` unchanged; A's inbound `framesDecoded` for B advances `>0` within 60s.
8. B toggles camera off → on again: existing-track flip path; `localVideoTrackId` stable, `cameraOn` flips, no re-acquire.

### Edge Cases
- This is the path the brief flags as fully dead today (`if (!stream) return false`). If B genuinely had `localStream()===null`, the fix must CREATE the stream then add the track. Assert post-click that `localStream()` is non-null (via a debug field or the truthy `localVideoTrackId`, which can only be reported if a stream holds the track).

### Verification
Same e2e file. Proof: `localVideoTrackId` undefined→truthy, A `framesDecoded` for B 0→>0, `sfuPublishState` stays `published`. SOFT — gated on fake-media video (reliable, unlike audio).

---

## S5 — [SOFT e2e] Never-stiff: controls are NEVER `[disabled]` regardless of pre-join permission state
**Roles:** 1 client suffices. **Type:** regression-guard / feature. **Preconditions:** join with mic-off + camera-off (worst-case "skipped everything" pre-join).

### Acceptance Criteria (concrete, assertable)
- In-call mic button (`button.primary-toggle` within the mic `.split-control`) has NO `disabled` attribute and is `enabled` per Playwright `toBeEnabled()`, in BOTH off and on states.
- Same for the camera button.
- The buttons remain enabled after a failed acquire (simulate by… see verification) — a failure NEVER toggles them to disabled.

### Steps
1. Join `?sfu=1` mic-off camera-off; `.call-panel` visible.
2. Assert mic button `toBeEnabled()` and `not.toHaveAttribute('disabled')`; same camera button.
3. Click mic (acquires under fake-media auto-grant) → still enabled.
4. Click mic again to mute → still enabled (and `.is-off`, but enabled).
5. Same sequence for camera.

### Edge Cases
- Even when `is-off` styling is applied (dead-LOOKING), the element must be interactive. Assert `class~="is-off"` AND `toBeEnabled()` simultaneously to prove styling ≠ disablement.

### Verification
Same e2e file, single-client. Proof: `toBeEnabled()` true across all states. This is a cheap, fake-media-robust guard (no remote peer needed) so it can be promoted toward HARD if S3/S4 prove flaky — but as written it is SOFT.

---

## S6 — [MANUAL localhost — browser-blocked path] NotAllowedError re-attempts + shows dismissible hint, never disables
**Roles:** 1 real Chrome on localhost. **Type:** feature (acceptance #3 hard-block path). **Preconditions:** the site's camera/mic permission set to "Block" in Chrome site settings (a genuine prior hard deny — fake-media cannot model this).

### Acceptance Criteria (concrete, assertable by human + screenshot)
- Click in-call mic (blocked) → `getUserMedia` throws `NotAllowedError`; the app calls `permissionBlockHint('audio', err)` and sets `actionNotice` to that non-null hint. The banner (`room.page.html:200`) renders with the hint text naming "microphone" + the address-bar/site-settings unblock affordance, plus a working `Dismiss` button.
- The mic button STAYS enabled and `.is-off` (NOT disabled) — clicking it AGAIN re-invokes `getUserMedia` (re-attempt every click; verify via devtools that a new `getUserMedia` call fires on each click).
- Same for camera (hint names "camera").
- No modal/dialog dead-end appears; no permanent disable; clicking `Dismiss` clears the banner and the control is still clickable.

### Steps (manual, screenshot each)
1. Chrome → site settings for `localhost` → set Camera + Microphone = Block. Reload, join the room.
2. Click in-call mic → screenshot banner with hint; confirm button still enabled.
3. Click mic again → devtools Network/console shows a fresh getUserMedia attempt (re-attempt proof).
4. Click `Dismiss` → banner clears; button still clickable. Screenshot.
5. Repeat 2-4 for camera.
6. Flip site settings back to "Ask"/"Allow", click again → acquires successfully (proves keep-live: no permanent lock from the earlier block).

### Verification
Manual localhost note in the test report with 4+ screenshots (blocked-mic banner, blocked-camera banner, dismissed state, post-unblock success). This is the honest-platform path: getUserMedia only re-prompts when permission state is "prompt"; "denied" is browser-enforced — re-attempt + hint is the max the platform allows. Documented as such.

---

## S7 — [MANUAL localhost] Three rendered states for BOTH mic and camera
**Roles:** human on localhost. **Type:** feature evidence. **Preconditions:** none beyond a running dev build.

### Acceptance Criteria (screenshots)
For BOTH mic AND camera, capture and label:
1. **off-with-stream:** joined with the OTHER device on (so a localStream exists) but this device off → click enables via the flip/acquire path; before+after screenshot, button enabled throughout.
2. **no-stream:** joined fully off (no localStream) → click acquires + creates stream; before (`.is-off`) + after (on) screenshot.
3. **browser-blocked:** the S6 banner state (can reuse S6 screenshots).

### Verification
6 labelled screenshots (mic×3, camera×3) in the test report. Proves the rendered UI in each state matches the "never stiff" intent (enabled control + correct icon/`is-off` + banner only in blocked case).

---

## S8 — [SOFT e2e] No regression to existing working paths
**Roles:** as needed. **Type:** regression. **Preconditions:** standard SFU 2-client.

### Acceptance Criteria (concrete)
- **off-with-stream enable** (the path that already works): join camera-on + mic-on, toggle mic off then on, toggle camera off then on → flip paths still flip `enabled` on the SAME track (`localAudioTrackId`/`localVideoTrackId` stable), `micOn`/`cameraOn` signals correct.
- **screen-share toggle** unaffected: start/stop screen share still works (`screenOn` flips, no error).
- **device selection** unaffected: open mic device chevron → select a device → `replaceInCallAudio` still swaps track (existing `replaceAudioTrack` path), `sfuPublishState` stays `published`.
- **prior audio-playout + mic-persistence fixes** (B1/B2 of the prior run) not regressed: remote audio still playable, `resolveSelectedAudioId` persistence behavior unchanged (run `device-selection.spec.ts` + `remote-audio-playability.spec.ts` — still green).

### Steps
1. Run the prior pure specs: `npx tsx device-selection.spec.ts` and `npx tsx remote-audio-playability.spec.ts` → both exit 0.
2. e2e: 2-client, exercise mic flip / camera flip / screen-share / device-select; assert no thrown errors and signals correct.

### Verification
Prior specs green (HARD sub-check — these are deterministic). e2e regression SOFT.

---

## S9 — [HARD GATE] Clean build
**Type:** build gate.
### Acceptance Criteria
- `npx ng build` from `frontend/` completes with no TS errors. New `media-toggle.ts` imported by `media.service.ts`/`room.page.ts` compiles; no unused-symbol or type errors.
### Verification
`cd frontend && npx ng build` exits 0. HARD — non-negotiable.

---

## Coverage map → og-requirements § RC acceptance
| RC acceptance | Scenarios |
|---|---|
| 1. Mic acquire from off/absent + publish + remote hears + toggle after | S1 (decision), S3 (e2e acquire+publish), S7.mic, S8 (flip-after) |
| 2. Camera acquire from off/absent incl. no-localStream + publish + remote sees | S1 (decision), S4 (e2e acquire incl. no-stream), S7.cam, S8 (flip-after) |
| 3. Never stiff / no dead-end / NotAllowedError re-attempt + hint, never disable | S1 (no blocked action), S2 (hint logic), S5 (never `[disabled]`), S6 (blocked manual) |
| 4. No regression (off-with-stream, screen-share, device-select, prior audio/mic fixes) | S8 |
| 5. Unit-provable decision + manual states note (both kinds) | S1, S2 (tsx HARD), S6 + S7 (manual notes) |

**Gate summary:** B1 is DONE when S1+S2 (`media-toggle.spec.ts` tsx) pass, S8's prior specs stay green, and S9 build is clean (all HARD). S3-S5 e2e + S6/S7 manual notes are the SOFT/manual evidence layer, captured best-effort per fake-media limits.
