# Batch B1 — Audio-publish guard (no-track prevention)
**Run:** projcore-run-2026-05-28  
**Date:** 2026-05-28  
**Req:** R1  
**Est:** 20min  
**Status gate:** `ng build` 0 errors + `[sfu] publish deferred` warn visible in console when mic is blocked

---

## Context

Two recent calls (May 26 + May 27) had zero audio. Investigation confirmed one cause: `room.page.ts` calls `sfuClient.publish({ localStream: this.media.localStream() })` synchronously when the `admitted` WS message arrives. If `localStream` is null or has no live audio tracks at that instant (mic permission not yet granted, stream still initializing), `sfu-client.service.ts doPublish()` creates an audio transceiver without a track (`addTransceiver('audio', { direction: 'sendrecv' })`). The `trackParams` filter at line 641 (`t.sender.track !== null`) then excludes this transceiver from the Cloudflare Realtime publish → CF session has zero audio tracks → remote users hear nothing. Diagnostics show "Audio sender: No track".

## File locations

- `frontend/src/app/pages/room/room.page.ts` — `admitted` handler at line ~944
- `frontend/src/app/services/sfu-client.service.ts` — `doPublish()` at line 572; existing logic at line 616

## The fix

**In `room.page.ts` admitted handler (around line 944-958):**

Replace the direct `sfuClient.publish(...)` call with a guarded publish that waits up to 5 seconds for `localStream` to have at least one non-ended audio track.

Current code (line 944-957):
```typescript
if (msg.participantId && msg.sessionId) {
  void this.sfuClient
    .publish({ clientKey: readClientKey(), participantId: msg.participantId, sessionId: msg.sessionId, localStream: this.media.localStream() })
    .then(() => {
      const state = this.sfuClient.localPublishState();
      if (state?.status === 'published') {
        this.ws.send({
          type: 'sfu-publish',
          cfSessionId: state.cfSessionId,
          tracks: state.tracks.filter((t) => t.status === 'live').map((t) => ({ trackName: t.trackName, kind: t.kind })),
        });
      }
    })
    .catch((err: unknown) => console.error('[sfu-client] publish failed', err));
}
```

Replace with:
```typescript
if (msg.participantId && msg.sessionId) {
  void (async () => {
    const deadline = Date.now() + 5000;
    let stream = this.media.localStream();
    while (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended') && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 100));
      stream = this.media.localStream();
    }
    if (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended')) {
      console.warn('[sfu] publish proceeding without live audio track — mic may be unavailable');
    }
    await this.sfuClient.publish({ clientKey: readClientKey(), participantId: msg.participantId, sessionId: msg.sessionId, localStream: stream });
    const state = this.sfuClient.localPublishState();
    if (state?.status === 'published') {
      this.ws.send({
        type: 'sfu-publish',
        cfSessionId: state.cfSessionId,
        tracks: state.tracks.filter((t) => t.status === 'live').map((t) => ({ trackName: t.trackName, kind: t.kind })),
      });
    }
  })().catch((err: unknown) => console.error('[sfu-client] publish failed', err));
}
```

**No changes to `sfu-client.service.ts`** — the null-track transceiver behavior is correct SDP negotiation (always pre-negotiate audio transceiver for replaceTrack later); the fix is ensuring we have a live track to add at publish time.

## Constraints

- Lifecycle: pre-live — deferral OFF. No TODO comments. No deferred cleanup.
- Do NOT change any SFU API contract, any other call site, or any service.
- The IIFE must use `async/await` — no additional Promise wrapping.
- The 5s timeout must log a warn (`console.warn`) before proceeding — the publish still goes through (don't block indefinitely; mic-blocked is a user issue).
- One commit: `fix(sfu): wait for live audio track before SFU publish`

## Gate

1. `cd /home/agjrom/websites/meet-poc/frontend && ng build` — must pass 0 errors, 0 type errors.
2. Write `STATUS: DONE` in this session with the commit hash.
3. Do NOT deploy — projcore handles deployment after B2 completes.
