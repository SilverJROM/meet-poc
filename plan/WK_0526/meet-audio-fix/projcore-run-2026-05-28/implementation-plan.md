# Implementation Plan — Meet Audio Silence Fix
**Created:** 2026-05-28  
**Run:** projcore-run-2026-05-28  
**Lifecycle:** pre-live (deferral OFF)  
**Pattern:** 2 — codex-in-tmux (`voice` session)

---

## Batch overview

| Batch | Title | Req | Est | Files |
|-------|-------|-----|-----|-------|
| B1 | Audio-publish guard (no-track prevention) | R1 | 20min | `room.page.ts`, `sfu-client.service.ts` |
| B2 | Autoplay fix — extend Web Audio mixer to all platforms | R2, R3 | 20min | `remote-audio.service.ts`, `platform.service.ts`, `room.page.ts` |
| B3 | Subscribe retry guard clear on PC reset | R4 | 15min | `sfu-client.service.ts` |
| B4 | Build verification + DEV smoke test | ALL | 15min | build + deploy |

---

## B1 — Audio-publish guard

**Problem:** `room.page.ts:946` calls `sfuClient.publish({ localStream: this.media.localStream() })` synchronously on the `admitted` WS message. If `localStream` is null or `getAudioTracks()` returns [] (mic not yet granted, stream still initializing), `doPublish()` creates transceivers with null senders → CF publish has zero audio tracks.

**Fix:**
1. In `room.page.ts` `admitted` handler (line ~946): before calling `sfuClient.publish`, check `localStream?.getAudioTracks().filter(t => t.readyState !== 'ended').length > 0`. If not, wait via a poll/signal-watch (max 5s). If still not ready after 5s, log `[sfu] publish deferred — no live audio track` and continue (mic permission may be blocked, which is a user issue).
2. Guard must be a local await/timer — do not change the WS message flow.
3. No TODO comments. No deferred cleanup.

**Acceptance:**  
- `ng build` passes.  
- In a test join with mic granted: diagnostics `outboundAudio.bytesSent > 0` within 10s.  
- In a test join with mic blocked: publish succeeds without audio track (logged), no unhandled error.

---

## B2 — Autoplay fix via Web Audio mixer for all platforms

**Problem:** `RemoteAudioService.mixerEnabled()` returns `this.platform.isIOS()` — the Web Audio graph (AudioContext → GainNode → MediaStreamAudioDestinationNode → one `<audio>`) is iOS-only. On desktop Chrome/Firefox, each peer gets a direct `<audio data-remote-audio>` element whose `.play()` requires a live transient user activation — which fails when peers join after the activation window expires or after PC reset.

**Fix:**
1. Change `mixerEnabled()` to return `true` for ALL platforms (remove the iOS gate). The Web Audio path is already implemented and correct — just need to enable it universally.
2. Verify that `ensureGraph()` / `resumeContext()` / `unlockAndPlayRemoteSinks()` are called within all known user-gesture paths in `room.page.ts` (join click, admit click, enableRemoteAudio). These calls are already present — confirm they reach the mixer on non-iOS.
3. `AudioContext.resume()` is far more permissive than `audio.play()` — once the context is in `running` state it stays there across SFU PC resets, solving R3 as a side-effect.
4. Remove any platform-check dead branches made obsolete by this change. No backwards-compat shims.

**Acceptance:**  
- `ng build` passes.  
- On desktop Chrome: remote audio plays when peer joins >10s after host's last interaction.  
- On iOS Safari: behavior unchanged (mixer was already active).  
- `debugSnapshot().mixerEnabled === true` on Chrome desktop.

---

## B3 — Subscribe retry guard clear on PC reset

**Problem:** `sfu-client.service.ts` `subscribeIfNeeded()` inserts into `subscribedClientIds` before the retry queue. After 7 retries, the entry stays forever — `resetForReconnect()` creates a new RTCPeerConnection but does NOT clear `subscribedClientIds`. If a subscriber hit the retry cap because the publisher had no track (Failure Mode A), fixing the publisher won't help an in-progress call — the subscriber is permanently blocked.

**Fix:**
1. In `sfu-client.service.ts` `resetForReconnect()` (or equivalent PC-teardown method): call `subscribedClientIds.clear()` (or remove entries for the reset PC's peers, if the set is PC-scoped).
2. Verify no other callers depend on `subscribedClientIds` surviving a PC reset.
3. No TODO comments.

**Acceptance:**  
- `ng build` passes.  
- After simulated `resetForReconnect()`, `subscribedClientIds` is empty (verifiable via debug snapshot or console log).

---

## B4 — Build + DEV smoke

**Actions:**
1. Run `ng build --configuration production` in `frontend/` — must succeed with 0 errors.
2. Deploy to DEV via `pm2 restart meet-poc-fe` (or `npm run build && pm2 restart`).
3. Open two browser tabs on `https://voice.silverjrom.app` — join same room.
4. Verify: both sides hear each other (no mute icon, audio level visible in diagnostics).
5. Check diagnostics: `outboundAudio.bytesSent > 0`, `inboundAudio.bytesReceived > 0`, `contextState = running` (from `debugSnapshot`).

**Acceptance:** Diagnostics confirm both-way audio. No console errors. Build artifact is clean.

---

## Dependencies

B1 → B2 → B3 are independent (different files / concerns) — can be implemented in order but each gates on its own build check before B4.  
B4 depends on B1 + B2 + B3 all complete.

---

## Commit policy
One commit per batch, on main (no branch — pre-live, dev only). Message format: `fix(sfu): <description>`.
