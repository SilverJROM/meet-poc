# Follow-on fix — opQueue poisoning + HTTP timeouts on /sfu/session + /sfu/tracks

The ice-config timeout (commit 81305fb) is necessary but insufficient. Re-reading the code reveals two related gaps that explain "this isn't the first time":

## What I found

1. `doPublish` has **THREE unbounded awaits** between publishState-set and pc-creation, not one:
   - `await this.iceConfigService.getIceServers()` — FIXED in 81305fb with 5s client timeout.
   - `await firstValueFrom(this.http.post<...>('/api/sfu/session', ...))` — NO timeout.
   - `await firstValueFrom(this.http.post<...>('/api/sfu/tracks', ...))` — NO timeout.
   Either of the second/third can hang indefinitely, stalling publish AFTER pc is created (so the partial-snapshot telemetry will show `publishPhase: 'cf-session'` or `'cf-tracks'`).

2. **opQueue poisoning across SFU client lifetime**. `SfuClientService` is `providedIn: 'root'` — singleton across the entire app. `opQueue` chains every enqueued op. Three problems:
   - If `doPublish` hangs on a never-resolving HTTP call, `opQueue.then(...)` stays pending → every subsequent `enqueue()` chains off the pending op → also hangs. New publish calls return promises that never resolve.
   - `destroy()` (called from `ngOnDestroy`) clears almost everything but **does not reset `opQueue`**. So when JROM navigates away from a room (which calls cleanupCall → closeLiveTracksForExit → destroy) and back, the singleton's `opQueue` is whatever it was at exit — potentially poisoned.
   - `closeLiveTracksForExit()` also does not reset `opQueue` — same problem in the exit-then-rejoin path within the same Angular session.
   - `resetForReconnect()` IS the only place that resets `opQueue = Promise.resolve()`. That's only called when JROM RE-admits to the same room (rare).

3. **The partial-diagnostics snapshot you just landed will reveal which case is firing**: `publishPhase: 'cf-session'` = hung POST /api/sfu/session; `publishPhase: 'cf-tracks'` = hung POST /api/sfu/tracks; `publishPhase: 'ice-config'` = somehow the new timeout didn't take effect. After the next JROM test, we'll know.

## Scope of THIS follow-on fix

### Part 1 — Timeouts on /sfu/session and /sfu/tracks (FRONTEND)

File: `frontend/src/app/services/sfu-client.service.ts`

In `doPublish`, wrap each of these two `firstValueFrom(http.post(...))` calls in the same `withTimeout(promise, ms, label)` helper you used for ice-config. Cap = **6000ms** each (CF normally responds in <1s; 6s is generous and well under user patience). On timeout, the existing try/catch will set `publishState = {status: 'error', error: '...'}` and rethrow — same shape as any other publish failure.

Also wrap any other `firstValueFrom(http.put('/api/sfu/renegotiate', ...))` or `http.put('/api/sfu/tracks/update', ...)` or `http.put('/api/sfu/tracks/close', ...)` calls inside `doSubscribeTracks`, `doPublishScreen`, etc. — same 6s cap. These run inside enqueued ops; hangs here also poison opQueue. Use the helper consistently.

Add the helper at the bottom of the file (matching the ice-config service style). If the helper would otherwise duplicate, extract it to a tiny shared module — but a local copy is fine to keep the diff focused.

### Part 2 — Reset opQueue in all teardown paths (FRONTEND)

File: `frontend/src/app/services/sfu-client.service.ts`

Three places to reset `this.opQueue = Promise.resolve()`:
- `closeLiveTracksForExit()` (line 618) — after the `this.pc = null` block, alongside the other state clears.
- `destroy()` (line 647) — same.
- (`resetForReconnect()` already resets it at line 606 — leave as-is.)

Why: ensures every fresh "enter a room" path starts with a pristine queue, even if a prior op was never awaited to completion.

### Part 3 — Surface a publish failure to the UI (FRONTEND, lightweight)

File: `frontend/src/app/pages/room/room.page.ts`

The admitted-handler IIFE swallows errors via `.catch((err) => console.error(...))`. Add a tiny user-visible cue when publish fails: `this.actionNotice.set('Unable to start your audio/video. Please refresh the page.')`. The existing `.action-notice` UI surface handles this notice with a Dismiss button.

This way, if the new timeouts trip, JROM doesn't think the call silently works — he sees actionable feedback.

## Hard constraints

- ONLY touch `sfu-client.service.ts` and `room.page.ts`. No backend changes in this batch.
- DO NOT modify the timeout cap on ice-config that you already landed (5000ms).
- DO NOT add new tracking signals beyond what 81305fb already added.
- DO NOT change opQueue's contract — it remains a single Promise chain. Only the reset points change.
- Keep the existing `.catch(() => undefined)` on the wrapper in `enqueue` — it already swallows rejections so a single failed op doesn't poison; the new reset points are defense-in-depth.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors (no backend changes expected, but build must stay clean).
2. `cd frontend && ng build` — 0 errors.
3. Manual code review: all three `firstValueFrom(http.{post,put}(...))` in `doPublish` + `doSubscribeTracks` + `doPublishScreen` are wrapped with `withTimeout`. Both `closeLiveTracksForExit` and `destroy` reset `opQueue`. Admitted IIFE catch sets `actionNotice`.
4. e2e regression: `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 4/4 PASS.
5. Write `validation/followon-changes.md`: files touched, what each does, why opQueue reset matters.
6. Commit: `fix(sfu): http timeouts on session/tracks + opQueue reset on teardown + user notice on publish failure`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/followon-blocker.md`, do NOT push.
- If you find that a 6s timeout breaks legitimate slow CF responses in your code review, STOP and propose a different cap.

Final line MUST be: `STATUS: DONE — follow-on fix ready for validation`.
