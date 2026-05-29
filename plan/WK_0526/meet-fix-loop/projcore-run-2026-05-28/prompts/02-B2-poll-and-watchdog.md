# B2 — Trim audio-publish poll + subscribe-stuck watchdog (R5, R6)

This batch has the two changes you raised in your consultation. I AGREE with both — they are locked in below.

## Part 1 — R5: Trim poll cap

**File:** `frontend/src/app/pages/room/room.page.ts`
**Edit:** Inside the admitted-handler IIFE (currently around line 948), change `Date.now() + 5000` → `Date.now() + 1500`. One-line edit. Reason: lobby preflight guarantees a live audio track before `join()`; 5s is overcautious and visibly contributes to perceived "CONNECTING stuck" — 1500ms is plenty of headroom.

## Part 2 — R6: Subscribe-stuck watchdog (with your two PROPOSE-CHANGES applied)

**File:** `frontend/src/app/services/sfu-client.service.ts`

### Locked change 1 — `subscribeFirstFrameAt` must mean "ontrack fired"

DELETE the fallback at lines 781–784:
```typescript
// Subscribe-latency: mark when this subscribe fully resolved (mids reconciled = tracks established)
if (!this.subscribeFirstFrameAt.has(publisher.clientId)) {
  this.subscribeFirstFrameAt.set(publisher.clientId, Date.now());
}
```

Rationale (yours): masks the exact stuck condition R6 must detect. Existing diagnostics (`subscribeLatencies`) read it at line 210 with `?? null` — they correctly report `null` / `null` when ontrack never arrives. That is the correct behavior, not a regression.

### Locked change 2 — Disarm in ALL teardown paths

Add a `subscribeStuckTimers: Map<string, ReturnType<typeof setTimeout>>` field and helpers:

```typescript
private subscribeStuckTimers = new Map<string, ReturnType<typeof setTimeout>>();
private readonly SUBSCRIBE_STUCK_THRESHOLD_MS = 10_000;

private armSubscribeStuckWatchdog(publisherClientId: string): void {
  if (this.subscribeStuckTimers.has(publisherClientId)) return;
  const initiatedAt = this.subscribeInitiatedAt.get(publisherClientId) ?? Date.now();
  const timer = setTimeout(() => {
    this.subscribeStuckTimers.delete(publisherClientId);
    if (this.subscribeFirstFrameAt.has(publisherClientId)) return;
    console.warn('[sfu] subscribe stuck >10s — no ontrack from publisher', {
      publisherClientId,
      initiatedAtMs: initiatedAt,
      elapsedMs: Date.now() - initiatedAt,
      subscribedClientIds: [...this.subscribedClientIds],
      pcConnectionState: this.pc?.connectionState ?? null,
      pcIceConnectionState: this.pc?.iceConnectionState ?? null,
      retryAttempts: this.subscribeRetryAttempts.get(publisherClientId) ?? 0,
    });
  }, this.SUBSCRIBE_STUCK_THRESHOLD_MS);
  this.subscribeStuckTimers.set(publisherClientId, timer);
}

private disarmSubscribeStuckWatchdog(publisherClientId: string): void {
  const timer = this.subscribeStuckTimers.get(publisherClientId);
  if (timer) {
    clearTimeout(timer);
    this.subscribeStuckTimers.delete(publisherClientId);
  }
}

private clearAllSubscribeStuckWatchdogs(): void {
  for (const timer of this.subscribeStuckTimers.values()) clearTimeout(timer);
  this.subscribeStuckTimers.clear();
}
```

**Arm point:** At the end of `subscribeIfNeeded` (just before the closing `});` after the enqueue block ~line 100), but ONLY on the path where the enqueue is actually issued. Place it after `this.subscribedClientIds.add(publisher.clientId);` so it's gated by all the early-return guards above it (self-skip / already-subscribed / no-tracks).

```typescript
subscribeIfNeeded(publisher: ...): void {
  if (publisher.cfSessionId === this.localPublishState()?.cfSessionId) return;
  if (this.subscribedClientIds.has(publisher.clientId)) return;
  if (!publisher.tracks.length) return;
  this.subscribedClientIds.add(publisher.clientId);
  this.armSubscribeStuckWatchdog(publisher.clientId);   // ← NEW
  void this.enqueue(() => this.doSubscribe(publisher)).catch(() => { ... });
}
```

**Disarm point:** Inside `pc.ontrack` (line ~586–613), the existing block at line 591–593 (`if (!has) set subscribeFirstFrameAt`) is now the canonical "first ontrack" indicator (because of locked change 1). Add a `disarmSubscribeStuckWatchdog(entry.publisherClientId)` inside that same `if (!has)` body so it fires exactly once per publisher on first real track.

```typescript
if (!this.subscribeFirstFrameAt.has(entry.publisherClientId)) {
  this.subscribeFirstFrameAt.set(entry.publisherClientId, Date.now());
  this.disarmSubscribeStuckWatchdog(entry.publisherClientId);   // ← NEW
}
```

**Cleanup points:** call `this.clearAllSubscribeStuckWatchdogs()` in BOTH `resetForReconnect` (line ~510 area, alongside the existing `subscribeRetryAttempts.clear()` / `subscribeInitiatedAt.clear()` / `subscribeFirstFrameAt.clear()`) AND the second reset block (line ~562 area — `destroy`-equivalent). Also disarm in `handleSfuPresence` at line ~280 where the per-publisher retry state is wiped on `cfSessionId` change (call `disarmSubscribeStuckWatchdog(msg.clientId)` there too — a fresh publisher session means the old watchdog is stale).

## Hard constraints

- ONLY touch `room.page.ts` (1-line poll-cap edit) and `sfu-client.service.ts` (watchdog + fallback removal). No other files.
- No new dependencies. No new public API surface. The watchdog is private.
- The warning MUST be `console.warn` only — no UI surfacing, no telemetry endpoint, no auto-retry. It is diagnostic-only for R6.

## Acceptance gate (you do these before reporting DONE)

1. `cd /home/agjrom/websites/meet-poc/frontend && ng build` — 0 errors, 0 new warnings.
2. Manual code review: confirm the watchdog is armed exactly when an enqueue happens, disarmed only on real ontrack (not on subscribe-response).
3. Write `plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/validation/B2-changes.md` (Codex-style): files touched, what changed, why, including a one-line trace of arm→fire / arm→disarm-by-ontrack / arm→disarm-by-reset paths.
4. Commit with message: `fix(sfu): tighten audio-publish poll + subscribe-stuck watchdog`. One commit.

## Stop conditions

- 3× `ng build` failure → STOP, write `validation/B2-blocker.md`, do NOT push.
- If you find that removing the `subscribeFirstFrameAt` fallback breaks the diagnostics table type (e.g., consumers expect non-null `firstFrameAtMs`), STOP and report before pressing on.

Final line MUST be: `STATUS: DONE — B2 ready for validation`.
