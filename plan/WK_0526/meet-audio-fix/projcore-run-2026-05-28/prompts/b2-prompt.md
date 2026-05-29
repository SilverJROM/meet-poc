# Batch B2 — Autoplay fix: extend Web Audio mixer to all platforms
**Run:** projcore-run-2026-05-28  
**Date:** 2026-05-28  
**Req:** R2, R3  
**Est:** 20min  
**Status gate:** `ng build` 0 errors; `debugSnapshot().mixerEnabled === true` on Chrome desktop

---

## Context

May 27 23:46 call: audio transport was working (ICE connected relay→srflx, bytesReceived increasing, 0 packet loss) but the remote side heard silence. Root cause: `<audio data-remote-audio>` elements in tile components had their `.play()` call rejected by the browser autoplay policy. The user's last "Join" click was 36 seconds before the peer joined; by then the transient activation window had expired. The `effect()` at `room.page.ts:364` calls `unlockAudioFromGesture(false)` via `window.setTimeout` — this is NOT a user gesture → `audio.play()` is rejected.

Additionally, SFU PC reset (`resetForReconnect`) creates new RTCPeerConnection + new `<audio>` elements that also need the same unlock, and the same gesture-expiry problem applies.

**The fix:** The Web Audio mixer (`AudioContext → GainNode → MediaStreamAudioDestinationNode → one <audio>`) is already implemented and works on iOS. Extending it to all platforms solves the autoplay issue permanently because:
1. `AudioContext.resume()` is far more permissive than `audio.play()` — once created during a user gesture, it can be resumed outside gesture handlers
2. The single mixer `<audio>` element is played once during the join gesture, then stays playing across PC resets
3. New peer audio flows through the already-running graph automatically — no `play()` call per peer

## Files

- `frontend/src/app/services/remote-audio.service.ts` — `mixerEnabled()` at line 32-34
- `frontend/src/app/pages/room/room.page.ts` — `iosRemoteAudioMixerEnabled` at line 120
- `frontend/src/app/pages/room/room.page.html` — all uses of `iosRemoteAudioMixerEnabled()`

## The fix

### 1. `remote-audio.service.ts`

Remove the `PlatformService` injection and change `mixerEnabled()` to always return `true`.

Current:
```typescript
private readonly platform = inject(PlatformService);
...
mixerEnabled(): boolean {
  return this.platform.isIOS();
}
```

After:
```typescript
mixerEnabled(): boolean {
  return true;
}
```

Remove the `inject(PlatformService)` line and the `PlatformService` import (check: it should only be used for `mixerEnabled()` in this file — confirm before removing). If `PlatformService` is used elsewhere in the file, keep the import.

### 2. `room.page.ts`

Rename `iosRemoteAudioMixerEnabled` to `remoteAudioMixerEnabled` and remove the platform dependency.

Current (line 120):
```typescript
readonly iosRemoteAudioMixerEnabled = computed(() => this.platform.isIOS());
```

After:
```typescript
readonly remoteAudioMixerEnabled = computed(() => true);
```

Note: `this.platform` is still injected and used in other places in this file (`isIOS()` at line 345, `isMobileUA()` at line 1927). Do NOT remove the platform injection — only update this one `computed` property.

### 3. `room.page.html`

Replace ALL occurrences of `iosRemoteAudioMixerEnabled()` with `remoteAudioMixerEnabled()`. There are 4 occurrences (lines 170, 188, 196 in the template — use grep to confirm exact count and lines before editing).

```
grep -n "iosRemoteAudioMixerEnabled" frontend/src/app/pages/room/room.page.html
```

Replace each one: `iosRemoteAudioMixerEnabled()` → `remoteAudioMixerEnabled()`

## Constraints

- Lifecycle: pre-live — deferral OFF. No TODO comments.
- Do NOT change how `unlockAndPlayRemoteSinks()` works — it already handles both paths correctly.
- Do NOT add any `@if` blocks or feature-gate the mixer — it must be always-on after this change.
- Do NOT touch tile.component.ts or tile.component.html — the `@if (!peer().isLocal && remoteAudioEnabled())` gate already correctly hides tile audio elements when `remoteAudioEnabled=false`.
- Two commits allowed if needed (service + template), but prefer one: `fix(audio): extend Web Audio mixer to all platforms`

## Gate

1. `cd /home/agjrom/websites/meet-poc/frontend && ng build` — must pass 0 errors, 0 type errors.
2. Confirm `grep -n "iosRemoteAudioMixerEnabled" frontend/src/app/pages/room/room.page.ts frontend/src/app/pages/room/room.page.html` returns 0 matches.
3. Write `STATUS: DONE` with commit hash.
4. Do NOT deploy — projcore handles deployment after both batches are done.
