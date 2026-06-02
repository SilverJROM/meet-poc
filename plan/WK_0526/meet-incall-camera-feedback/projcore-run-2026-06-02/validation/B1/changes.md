# Batch B1 Changes — In-call mic AND camera always enable-able; never stiff

## Branch: `feat/incall-media-always-enableable-20260602`  (Cut from `master` @ `a4c81cc`)

## User Report (verbatim from brief)
"whatever the case pre-joining don't grey-out or unallow click of the camera or mic inside the call. just re-ask for the users permission if they want to activate it inside the call. no hard deny BS, just full customizability here, the app should not be too stiff here."

## Root Cause (mechanism-level)
Two no-op early-returns dead-ended the in-call enable action when the device was off/absent at join — the button looked live (no `[disabled]`) but the action did nothing:

- **Bug A — `media.service.ts:230-236` `toggleMic()`**: `const track = this.localStream()?.getAudioTracks()[0]; if (!track) return false;`. When joined mic-off / absent, no audio track exists → returns `false` without ever calling `getUserMedia`. The toggle could only flip an already-present track.
- **Bug B — `media.service.ts:249-272` `toggleCamera()`**: `const stream = this.localStream(); if (!stream) return false;`. When there is NO local stream at all (joined fully off → `localStream()===null`), it dead-ends. (The stream-exists-without-video-track acquire branch at the old 263-271 already worked and is preserved.)

The fix replaces both early-returns with an `'acquire'` branch. The acquire-vs-flip decision is extracted into a pure, framework-free `resolveMediaToggleAction({streamExists, trackExists, trackEnabled})` (`media-toggle.ts`) whose action union is `{'acquire','enable','disable'}` — there is deliberately NO `'noop'/'blocked'/'denied'` member, which is what makes "never stiff" unit-provable: absence (no stream OR no track) ALWAYS maps to `'acquire'` (re-ask permission via `getUserMedia`), never a dead-end. A sibling pure `permissionBlockHint(kind, err)` maps a `NotAllowedError` / Chrome-legacy `PermissionDeniedError` rejection to a brief, non-blocking unblock hint (address-bar / site-settings affordance, no permanence words) and everything else to `null`; the room handler routes a non-null hint to the dismissible `actionNotice` banner and keeps the control live so the next click retries.

## Code Changes

### NEW `frontend/src/app/services/media-toggle.ts`
- `resolveMediaToggleAction({streamExists, trackExists, trackEnabled}): 'acquire'|'enable'|'disable'` — WHAT: pure decision; absence (`!streamExists || !trackExists`) ⇒ `'acquire'` (incoherent `streamExists:false`+`trackExists:true` still ⇒ `'acquire'`, defensive), else `trackEnabled` ⇒ `'disable'` / `'enable'`. WHY: makes the never-stiff contract (no blocked/noop action) unit-provable and shared by both toggles.
- `permissionBlockHint(kind, err): string | null` — WHAT: returns a non-empty device-naming, address-bar/site-settings-referencing hint (no `/disabled|forever/i`) ONLY for `name === 'NotAllowedError' || 'PermissionDeniedError'`; `null` otherwise; never throws on null/undefined. WHY: surfaces the genuine hard-block case as a non-blocking banner while deferring all other errors to the generic status path.

### NEW `frontend/src/app/services/media-toggle.spec.ts`
- `node:assert/strict` spec (mirrors `device-selection.spec.ts`: braced blocks, `./media-toggle.js` import, final `console.log`). Covers S1 steps 1-8 (every action outcome for audio+video + the incoherent edge + the union-has-no-blocked-member assertion) and S2 steps 1-5 (NotAllowedError audio/video, NotFoundError/generic ⇒ null, no-permanence-words) plus the `PermissionDeniedError` alias and null/undefined-err edges.

### `frontend/src/app/services/media.service.ts`
- Imported `resolveMediaToggleAction` from `./media-toggle` (used to branch — not a parallel copy).
- `toggleMic` — WHAT: now `async toggleMic(onAudioTrackChanged = async () => {}, options: {audioDeviceId?} = {})`; computes action via `resolveMediaToggleAction`; `enable`/`disable` flips `track.enabled` + `micOn.set` (unchanged); `'acquire'` calls `getUserMedia({audio: audioConstraints(true, options.audioDeviceId), video:false})`, `registerDebugTracks`, adopts the new stream via `localStream.set` when null else `stream.addTrack`, `micOn.set(true)`, `await onAudioTrackChanged(track)`, `startMicLevel(track)` (mirrors `replaceAudioTrack`). WHY: Bug A fix — joined mic-off/absent now ACQUIRES + publishes instead of no-op.
- `toggleCamera` — WHAT: restructured so the `'acquire'` branch (via `resolveMediaToggleAction`) covers BOTH no-localStream and stream-without-video-track; on acquire, `localStream.set(camStream)` when null else `stream.addTrack(track)` (added an empty-track stop-guard); flip-enabled branch behavior identical to before. WHY: Bug B fix — the `if (!stream) return false` dead path now creates the stream + acquires; preserves the already-working stream-without-track path.

### `frontend/src/app/pages/room/room.page.ts`
- Imported `permissionBlockHint` from `../../services/media-toggle`.
- `toggleMic()` handler — WHAT: now `await`s the async `media.toggleMic`, passing the SFU publish callback `(track)=>this.sfuClient.replaceAudioTrack(track)` + `{audioDeviceId: this.selectedAudioId() || undefined}`, clears `actionNotice`, and `broadcastMediaState(mic, …)` using the REAL returned mic state (not a stale signal read). `catch` ⇒ `handleInCallMediaPermission(err,'audio')`. WHY: wires the late mic acquire to publish on the pre-negotiated audioSender (no renegotiation).
- `toggleCamera()` handler — WHAT: kept try/catch + screen-share branch (`toggleCameraDuringShare`) untouched; added `actionNotice.set(null)` on success; repointed catch to `handleInCallMediaPermission(err,'video')`.
- NEW private `handleInCallMediaPermission(err, kind)` — WHAT: routes a non-null `permissionBlockHint` to `actionNotice.set(...)`, else falls back to the generic `status.set(...access failed...)`. WHY: NotAllowedError ⇒ non-blocking dismissible hint, never a dead-end/disable; control stays live for the next click.

## Commits
- `3c49133` [batch-1] add pure media-toggle decision (resolveMediaToggleAction + permissionBlockHint) + spec | scenarios: S1,S2
- `ed48fb4` [batch-1] in-call mic+camera always acquire from off/absent; NotAllowedError -> non-blocking actionNotice hint | scenarios: S1-S9

## Standing Rules (if discovered)
- The `node:assert` service specs must be run from `frontend/` with the full relative path (`npx tsx src/app/services/<spec>.spec.ts`) — running from inside `src/app/services/` makes tsx mis-resolve the `.js` import against `tsconfig.json`'s `baseUrl:"./"` and fails with `ERR_MODULE_NOT_FOUND` (confirmed identically against the existing `device-selection.spec.ts`).

## Verification
- **Build (S9, HARD):** PASS — `cd /home/agjrom/websites/meet-poc/frontend && npx ng build` → "Application bundle generation complete." exit 0. Only pre-existing unrelated warnings (DatePipe unused in rooms.page, stencil empty-glob, @mediapipe CJS) — none from the new module or the edited files.
- **Type-check:** PASS — covered by `ng build` (no TS errors; async `toggleMic` signature change verified — sole caller `room.page.ts:944` is awaited).
- **Unit (S1, S2, HARD):** PASS — `cd frontend && npx tsx src/app/services/media-toggle.spec.ts` → "media-toggle: all assertions passed" exit 0.
- **Regression specs (S8, HARD sub-check):** PASS — `npx tsx src/app/services/device-selection.spec.ts` → "device-selection: all assertions passed"; `npx tsx src/app/services/remote-audio-playability.spec.ts` → "remote-audio-playability: all assertions passed". Prior mic-persistence + audio-playout decisions unchanged.
- **DEV deploy:** not performed (out of scope per brief — lead/qa handle deploy + e2e).
- **Smoke walk:** not performed (no deploy); S3-S7 e2e/manual are the SOFT/manual evidence layer owned by qa per scenarios.md gate summary.

## Bug Reproductions
- **Bug A (mic):** before — joined mic-off ⇒ `toggleMic()` hit `if (!track) return false`, no `getUserMedia`, `localAudioTrackId` stayed undefined. after — `resolveMediaToggleAction({streamExists:true,trackExists:false})` ⇒ `'acquire'` ⇒ `getUserMedia` + add + `sfuClient.replaceAudioTrack` publish + `micOn.set(true)` + `startMicLevel`. (S1.2 asserts the decision; e2e S3 is the SOFT live proof.)
- **Bug B (camera, no-localStream):** before — joined fully off ⇒ `toggleCamera()` hit `if (!stream) return false`. after — `resolveMediaToggleAction({streamExists:false})` ⇒ `'acquire'` ⇒ `getUserMedia` + `localStream.set(camStream)` (creates the stream) + `cameraOn.set(true)` + `replaceEffectiveVideoTrack` publish. (S1.5 asserts the decision; e2e S4 is the SOFT live proof.)

## Caveats
- S3-S5 e2e and S6-S7 manual-localhost evidence are explicitly SOFT/manual per `scenarios.md` (fake-media cannot model a true browser "denied" state, and inbound audio RTP is unreliable under fake-media). This batch lands the HARD gates (S1, S2, S8 regression specs, S9 build); the live/manual layer is qa's to capture. PRE-EXISTING constraint, not introduced here.
- No template change was needed — `actionNotice` banner (`room.page.html:200-204`) and the non-`[disabled]` controls already exist; the hint reuses that banner.
