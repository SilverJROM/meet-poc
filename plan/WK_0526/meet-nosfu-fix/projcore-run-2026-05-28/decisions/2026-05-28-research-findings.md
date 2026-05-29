# Web research findings — no-SFU-publish bug

Source: claude/general-purpose agent, 2026-05-28, 128s runtime.

## Status check
- Cloudflare Realtime SFU: Operational on 2026-05-28, no active incidents.
- Recent CF outages (Feb 20 BYOIP, Apr 3, May 27) are unrelated.
- **No CF-side regression. The bug is client-side.**

## Three ranked hypotheses

### H1 — Angular `effect()` is tearing down the PC (HIGHEST EVIDENCE)
- Common antipatterns that match exactly:
  - An effect that reads a signal it also writes → re-execution storm → `onCleanup` closes `pc` and nulls `localPublishState` repeatedly.
  - An effect creating PC reads `localStream()` (a signal); track add/remove/replace mutates that signal → effect re-runs → PC torn down mid-handshake.
  - Nested effects (HeroDevs blog) leak old PCs without proper cleanup; ICE on the *old* PC reaches connected, but `this.pc` reference is a fresh null.
- Known Angular 18 bug #58211: multiple `onCleanup` calls only the last one runs.

### H2 — `pc.ontrack` registered AFTER `setRemoteDescription`
- ontrack fires SYNCHRONOUSLY inside `setRemoteDescription`. Handler wired after `await pc.setRemoteDescription(...)` misses the event entirely. Particularly likely on localhost where SFU answer is instant.

### H3 — `requiresImmediateRenegotiation` not honored, or m-line direction wrong
- CF `/tracks/new` (pull side) returns answer + `requiresImmediateRenegotiation: true` when SFU needs `createAnswer → setLocalDescription` after applying offer. Otherwise m-line stuck in `have-remote-offer`; ICE/DTLS connects but new transceivers never reach `stable` → no ontrack.

## Concrete fixes others have applied
1. Move PC creation OUT of `effect()` into service-scoped one-shot (or `effect({ allowSignalWrites: false })`).
2. Wire `pc.ontrack = ...` BEFORE the first `setRemoteDescription` — verified in our doPublish at line 586 ✓.
3. Implement the renegotiation branch — verified in our doSubscribeTracks at line 743 ✓.
4. Use `addTransceiver(kind, {direction})` with stable mids; don't mix `addTrack` and `addTransceiver`.
5. PartyTracks (CF's own observable lib) wraps PC churn as the central failure mode.

## Key URLs
- https://github.com/webrtcHacks/adapter/issues/622 — ontrack timing
- https://developers.cloudflare.com/realtime/sfu/sessions-tracks/ — 30s no-packets GC rule
- https://www.herodevs.com/blog-posts/the-overlooked-rule-that-breaks-angular-16s-signal-effects — exact effect re-execution mechanism
- https://github.com/angular/angular/issues/58211 — Angular 18 multi-onCleanup bug
- https://community.cloudflare.com/t/dead-tracks-high-priority/859160 — CF "dead tracks" community thread

## My initial code-review pass against these hypotheses

**H2 ruled out**: `pc.ontrack` is set inside `doPublish` IMMEDIATELY after `new RTCPeerConnection`, BEFORE the first `setRemoteDescription` (sfu-client.service.ts line 586). The handler also catches future-renegotiation ontracks since the PC object persists.

**H3 partially ruled out**: The renegotiation branch IS implemented in `doSubscribeTracks` (line 743). The order is correct (setRemoteDescription → createAnswer → setLocalDescription → PUT /renegotiate). However: this is the subscribe path; the PUBLISH path's m-line setup uses `addTransceiver` with `sendrecv` direction (line 617-625). The `'sendrecv'` direction could be a problem — for a publish-only PC, direction should be `'sendonly'`. Worth probing.

**H1 leading**: I need to enumerate every `effect()` in `RoomPage` and `SfuClientService` and confirm none of them read/write signals that would cause re-execution mid-publish. The PC is created in `doPublish` (not in an effect), but if doPublish is called from an effect-driven path, the effect's cleanup could torpedo it.
