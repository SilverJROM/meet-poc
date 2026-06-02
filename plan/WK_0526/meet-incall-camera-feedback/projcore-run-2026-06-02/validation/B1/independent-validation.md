# B1 Independent Validation — In-call mic/camera always enable-able; never stiff

## What I read + ran (fresh eyes, no plan/scenarios consulted)
- `changes.md` (the implementer's claims).
- The actual on-disk code: `media-toggle.ts`, `media-toggle.spec.ts`, `media.service.ts` (`toggleMic`/`toggleCamera`), `room.page.ts` (`toggleMic`/`toggleCamera` handlers + `handleInCallMediaPermission`), `controls-bar.component.html`, the `actionNotice` banner in `room.page.html`, and the `sfuClient.replaceAudioTrack`/`replaceVideoTrack` signatures in `sfu-client.service.ts`.
- Ran the deterministic unit gate: `cd frontend && npx tsx src/app/services/media-toggle.spec.ts` → `media-toggle: all assertions passed` (exit 0).

## Per-acceptance-criterion verdicts

### AC1 — Mic: joined mic off/absent → click ACQUIRES, adds to stream (creates if null), publishes, sets micOn. Toggle off/on after works. — PASS
- `media.service.ts:235-241` computes the action via `resolveMediaToggleAction` from real `streamExists`/`trackExists`/`trackEnabled`. No early `return false`.
- `media.service.ts:250-268` is the `'acquire'` branch: `getUserMedia({audio, video:false})` (250-253), `registerDebugTracks` (254), and — critically — `if (!stream) this.localStream.set(nextStream); else stream.addTrack(nextTrack)` (260-264) so it **creates the stream when null** and **adopts into the existing stream otherwise**. Then `micOn.set(true)` (265), `await onAudioTrackChanged(nextTrack)` (266 — the publish callback), `startMicLevel(nextTrack)` (267), `return true`.
- Publish callback is genuinely wired & invoked: `room.page.ts:944-946` passes `(track)=>this.sfuClient.replaceAudioTrack(track)` and the service `await`s it at line 266 — not passed-but-dead. `sfuClient.replaceAudioTrack(track)` exists (`sfu-client.service.ts:171`).
- Toggle-off/on-after: once a track exists, `resolveMediaToggleAction` returns `disable`/`enable` and the flip branch `media.service.ts:243-247` sets `track.enabled` + `micOn.set` — unchanged flip path, works.

### AC2 — Camera: joined cam off/absent INCL. no-localStream → click ACQUIRES video, adds + publishes, sets cameraOn. Stream-exists-without-track path preserved. — PASS
- `media.service.ts:286-292` computes the action; no `if (!stream) return false` dead-end (the old Bug B return is gone).
- `'acquire'` branch `media.service.ts:301-318` covers BOTH the no-localStream and stream-without-video-track cases: `getUserMedia({video})` (302), then `if (!stream) this.localStream.set(camStream); else stream.addTrack(track)` (311-315) — **creates the stream when null**, adopts otherwise. Sets `cameraOn.set(true)` (316), `await onVideoTrackChanged(track)` (317).
- Publish callback wired: `room.page.ts:961-967` passes `(track)=>this.replaceEffectiveVideoTrack(track)`, which (`room.page.ts:1111-1119`) calls `this.replaceSfuVideoTrackIfChanged` → `sfuClient.replaceVideoTrack` (`sfu-client.service.ts:167`). Invoked via the `await` at service line 317.
- Stream-exists-without-track flip path preserved: `media.service.ts:294-299` keeps the prior flip behavior (sets `enabled`, `cameraOn.set`, calls `onVideoTrackChanged(enabled ? existing : null)`).

### AC3 — Never stiff / no dead-end: controls never disabled on permission state; every click re-attempts; NotAllowedError → dismissible non-blocking hint, never permanent disable / modal. — PASS
- Decision helper has NO blocked/noop/denied action: `media-toggle.ts:17` union is exactly `'acquire' | 'enable' | 'disable'`; line 31 maps ALL absence (`!streamExists || !trackExists`) → `'acquire'`. Spec step S1.8 (`media-toggle.spec.ts:70-80`) asserts no `noop/blocked/denied` is ever returned — and the spec passes.
- Template: the mic button (`controls-bar.component.html:20-30`) and camera button (43-53) have NO `[disabled]` and nothing tied to permission state. The only `[disabled]` in the file is on the host record button (`:82 [disabled]="uploading()"`) — unrelated, out of scope.
- NotAllowedError path is non-blocking + leaves the button live: handlers catch and call `handleInCallMediaPermission(err, kind)` (`room.page.ts:951, 971`). That routes a non-null `permissionBlockHint` to `actionNotice.set(...)` (`room.page.ts:975-982`). The banner (`room.page.html:200-205`) is a `role="status"` div with a **Dismiss** button (`actionNotice.set(null)`) — not a modal, not an overlay, no permanent disable. Because nothing disables the button, the next click re-enters `toggleMic`/`toggleCamera` and re-runs `getUserMedia` (re-attempt every click). `permissionBlockHint` avoids permanence words (`media-toggle.ts:46-48`, asserted by S2.5).

### AC4 — No regression to stream-exists enable path, screen-share, device selection. — PASS
- Flip (existing-track off/on) path: mic `media.service.ts:243-247` and camera `294-299` are the prior behavior, gated by `action !== 'acquire'`. No behavior change for an existing track.
- Screen-share: `toggleCamera` handler short-circuits to `toggleCameraDuringshare` when `anyScreenShareActive()` (`room.page.ts:956-959`) BEFORE the new acquire path — screen-share branch untouched. `toggleScreen`/`executeScreenToggle` not modified.
- Device selection: `changeAudioDevice`/`changeVideoDevice`/`replaceAudioTrack`/`replaceVideoTrack` in `media.service.ts` unchanged; `device-selection` untouched. The new mic acquire passes `{audioDeviceId: this.selectedAudioId() || undefined}` so the selected device is honored.
- Unit gate green; changes.md reports `ng build` PASS and regression specs (device-selection, remote-audio-playability) PASS — consistent with the unedited code I read.

## Blindspots / concerns (skeptical pass)
- `toggleMic`'s default callback param is `(track: MediaStreamTrack | null) => Promise<void>` but the room handler passes a non-null-typed `(track)=>this.sfuClient.replaceAudioTrack(track)`; `replaceAudioTrack` accepts `MediaStreamTrack | null` so this is type-safe. Non-issue.
- Audio acquire does NOT remove/stop a prior audio track before adding (unlike `replaceAudioTrack` which swaps old→new). This is correct here: the acquire branch only runs when NO audio track exists (`trackExists:false`), so there is nothing to remove. No leak.
- Minor: on `getUserMedia` returning a stream with zero tracks of the kind, both branches stop the stream and `return false` (`media.service.ts:256-259, 307-310`) without surfacing a notice — but that is the rare empty-track edge, not the NotAllowedError contract, and leaves the button live for retry. Acceptable, not a dead-end.
- I did not drive a live browser call (per instructions); the publish-on-pre-negotiated-sender behavior is reasoned from the wired callback + existing `replaceAudioTrack`/`replaceVideoTrack` SFU methods, which the brief permits.

All four acceptance criteria are satisfied with file:line evidence; the never-stiff contract is unit-proven and the template carries no permission-tied disable.

STATUS: PASS
