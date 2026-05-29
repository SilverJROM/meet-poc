# Real fix — pc.ontrack race in doSubscribeTracks

JROM just ran a live test against the deployed app post-`86e4c9a`. Both peers `publishStatus: 'published'`, `publishPhase: 'done'`, `hasPc: 1`. **RTP audio bytes ARE arriving** (350KB+ from Jtest, 320KB+ from jrom — confirmed in `inboundTracks.bytesReceived` from session `dd0b5dd6-885e-46d8-9cc2-a3f536bfb9b8`). But `firstFrameAtMs: null` on both sides — **`pc.ontrack` JS event never fires**, so `remoteStreams` signal stays empty, tile stays at CONNECTING.

The previous two fixes (ice-config + opQueue + http timeouts) were necessary for publish to complete. They worked. But the actual symptom JROM has been reporting all along is THIS subscribe-side race.

## The race

`sfu-client.service.ts:741-768` — `doSubscribeTracks` renegotiation branch:

```ts
if (res.requiresImmediateRenegotiation && res.sessionDescription) {
  await this.pc.setRemoteDescription(res.sessionDescription);   // (1) browser creates new transceivers w/ mids
  const answer = await this.pc.createAnswer();                  // (2) event loop yields → pc.ontrack fires NOW
  await this.pc.setLocalDescription(answer);
  
  // (3) THIS runs only AFTER ontrack already fired and bailed
  const newTransceiverMids = this.pc.getTransceivers()...
  const reconciled = reconcileSubscribedMids(...);
  for (const r of reconciled) {
    this.midToEntry.set(r.realMid, entry);
  }
  
  await firstValueFrom(this.http.put('/api/sfu/renegotiate', ...));
}
```

`pc.ontrack` at line 586:
```ts
this.pc.ontrack = (event) => {
  const mid = event.transceiver.mid;
  if (!mid) return;
  const entry = this.midToEntry.get(mid);
  if (!entry) return;   // ← bails because midToEntry not populated yet
  ...
};
```

Per WebRTC spec, `track` events are queued as tasks during `setRemoteDescription` and fire on the next event-loop tick. The next `await` (`createAnswer`) yields control, ontrack fires, midToEntry empty, **silently dropped.**

## Fix

**Move the midToEntry population SYNCHRONOUSLY between `await setRemoteDescription` and `await createAnswer`.** Plus a buffered-ontrack safety net in case the timing slips.

### Part 1 — Move midToEntry population earlier

File: `frontend/src/app/services/sfu-client.service.ts`, in `doSubscribeTracks` renegotiation branch:

```ts
if (res.requiresImmediateRenegotiation && res.sessionDescription) {
  await this.pc.setRemoteDescription(res.sessionDescription);

  // Populate midToEntry BEFORE yielding to event loop again.
  // pc.ontrack events from the new transceivers fire on the NEXT task tick;
  // if midToEntry isn't populated by then, the handler bails and the track is dropped.
  const newTransceiverMids = this.pc
    .getTransceivers()
    .map((t) => t.mid)
    .filter((m): m is string => !!m && !existingMids.has(m));
  const reconciled = reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, publisher.clientId);
  for (const r of reconciled) {
    const entry: SubscribedTrackEntry = { publisherClientId: r.publisherClientId, trackName: r.trackName, kind: r.kind, mid: r.realMid };
    this.midToEntry.set(r.realMid, entry);
    nextSubscribed.set(r.realMid, entry);
  }
  // Replay any pending ontrack events that arrived too early.
  this.flushPendingOntrack();

  const answer = await this.pc.createAnswer();
  await this.pc.setLocalDescription(answer);

  await firstValueFrom(
    this.http.put('/api/sfu/renegotiate', { ...creds, cfSessionId, sessionDescription: { type: this.pc.localDescription!.type, sdp: this.pc.localDescription!.sdp } }),
  );
}
```

The reconciliation moves up; the http PUT stays at the bottom (CF doesn't need the answer until we send it). The reconcile block is now between `await setRemoteDescription` and `await createAnswer` — synchronous, no event-loop yield in between.

### Part 2 — Defensive: buffer too-early ontrack events

File: `frontend/src/app/services/sfu-client.service.ts`

Add a private field:
```ts
private pendingOntrack = new Map<string, RTCTrackEvent>();
```

Modify `pc.ontrack` handler (line 586) — when entry is not found, BUFFER the event instead of returning early:

```ts
this.pc.ontrack = (event) => {
  const mid = event.transceiver.mid;
  if (!mid) return;
  const entry = this.midToEntry.get(mid);
  if (!entry) {
    // Track arrived before midToEntry was populated. Buffer for replay.
    this.pendingOntrack.set(mid, event);
    return;
  }
  this.processOntrack(event, entry);
};
```

Extract the body of the original ontrack handler into a new `processOntrack(event, entry)` method (lines 587-612 — the first-frame timestamp + stream-add logic).

Add `flushPendingOntrack()`:
```ts
private flushPendingOntrack(): void {
  for (const [mid, event] of [...this.pendingOntrack]) {
    const entry = this.midToEntry.get(mid);
    if (entry) {
      this.pendingOntrack.delete(mid);
      this.processOntrack(event, entry);
    }
  }
}
```

Call `this.flushPendingOntrack()` after EVERY midToEntry update (the renegotiation branch above + the non-renegotiation else branch around line 771-777 + the screen-track add at line 449).

Also clear `this.pendingOntrack` in `resetForReconnect()`, `closeLiveTracksForExit()`, and `destroy()`.

### Part 3 — Make midToEntry empty drops observable

When `pc.ontrack` fires with no entry (the buffered path now), add a `console.warn`:
```ts
console.warn(`[sfu] ontrack arrived early for mid=${mid}, buffering for replay`);
```

So we can SEE this in console next time JROM tests.

## Hard constraints

- ONLY touch `frontend/src/app/services/sfu-client.service.ts`. No other files.
- DO NOT change the network protocol or the order of HTTP calls.
- DO NOT change pc.ontrack's behavior when entry IS found — same as before.
- The non-renegotiation else branch (line 769-777) also populates midToEntry; if that path can fire after a remote-track event, also call `flushPendingOntrack()` there.
- DO NOT remove the `if (!mid) return` early bail — mid is required.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Code review: confirm midToEntry population is BEFORE `await createAnswer`, the pending-buffer is wired, and flushPendingOntrack is called at every midToEntry-update site.
4. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 4/4 PASS (regression check). The connecting-window watchdog spec MAY now show fewer / no warnings because ontrack flushing might rescue the subscribe — that's a GOOD signal, just note it.
5. Write `validation/fix-ontrack-race.md`: files touched, the race timeline, why moving midToEntry earlier closes it, why the buffer is defense-in-depth.
6. Commit: `fix(sfu): populate midToEntry before pc.ontrack fires + buffer too-early track events`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/race-blocker.md`, do NOT push.
- If `reconcileSubscribedMids` returns fewer entries than expected when called earlier (e.g., transceiver mids not yet assigned right after setRemoteDescription), STOP and report. **(Important: this is the key timing assumption — verify by adding a temporary console.log of `newTransceiverMids.length` vs `responseTracks.length` and confirming they match. Remove the log before commit.)**

Final line MUST be: `STATUS: DONE — ontrack race fix ready for validation`.
