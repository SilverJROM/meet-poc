# Fix — publish stall before pc creation (ice-config hang)

I AGREE with your diagnosis. Locking it in:

**Root cause:** `IceConfigService.fetchIceServers()` calls `firstValueFrom(this.http.get('/api/ice-config'))` with **no timeout**. The backend `/api/ice-config` then awaits a Cloudflare TURN mint fetch (no AbortController, no timeout). If CF's TURN-mint endpoint slows/hangs even briefly, the whole client publish path stalls before `new RTCPeerConnection(...)`. That leaves `pc = null` while `localPublishState` is `{ status: 'publishing' }`. `collectDiagnostics()` returns null → `sfuDiagnostics` missing from every payload. No `sfu-publish` WS message ever sent → no `sfu-presence` for JROM at remote peers → remote peers never subscribe to JROM. Meanwhile JROM's subscribe effect short-circuits on `status !== 'published'` → JROM never subscribes to remote either.

This is the **real underlying bug** behind every "stuck CONNECTING" report. The audio-fix work earlier today + the fix-loop polish are unrelated — they didn't touch this path.

## Scope

### Part 1 — Client-side timeout on ice-config fetch (FRONTEND, required)

File: `frontend/src/app/services/ice-config.service.ts`

In `fetchIceServers()` (line 122): wrap the `firstValueFrom(this.http.get<...>('/api/ice-config'))` in a `Promise.race` against a `setTimeout(5000)` that rejects with a clearly-tagged error. On timeout, log `console.warn('[ice-config] /api/ice-config timed out — using fallback STUN')`, set `lastFetchError`, and return `DEFAULT_STUN_SERVERS`. The existing try/catch already handles error → fallback, so the timeout just becomes another error path. Use a small inline helper like:

```ts
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}
```

Cap is **5000ms** (CF normally returns in <500ms; 5s allows generous slack while still well within user patience).

### Part 2 — Server-side timeout on CF TURN mint (BACKEND, required)

File: `backend/src/modules/ice-config/index.ts`

In `readCloudflareTurn()` (line 56): the `fetch(...)` to `https://rtc.live.cloudflare.com/v1/turn/keys/.../credentials/generate` has no timeout. Add an `AbortController` with a **4000ms** timeout (slightly under client timeout so backend errors before client gives up):

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 4000);
try {
  const response = await fetch(`...`, { method: 'POST', headers: {...}, body: ..., signal: controller.signal });
  // existing handling
} catch (err) {
  console.warn(`[ice-config] Cloudflare TURN mint request failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  return null;
} finally {
  clearTimeout(timeoutId);
}
```

The existing fallthrough returns `null` → `getIceServersFromEnv()` returns just `DEFAULT_STUN_SERVERS` (+ static TURN if configured). Frontend gets a valid response with at least STUN.

### Part 3 — Make publish stall observable (FRONTEND, required)

File: `frontend/src/app/services/sfu-client.service.ts`

Three small additions:

**(a)** In `doPublish` (line 572), wrap the body in a try/finally that timestamps each phase into a new `localPublishPhase` signal (or a property like `publishPhase`). Phases: `'ice-config' | 'pc-create' | 'offer' | 'cf-session' | 'cf-tracks' | 'set-remote' | 'done' | null`. Set to the next phase BEFORE each `await`. This makes future stalls observable in `collectDiagnostics`.

**(b)** Modify `collectDiagnostics()` (line 158) to return a partial snapshot even when `!pc || !publishState`, so we ALWAYS get some data in the diagnostics payload. New shape (suggest extending `SfuDiagnosticsSnapshot` with `publishPhase` + `hasPc: boolean` + `publishStatus: 'publishing'|'published'|'error'|null`):

```ts
async collectDiagnostics(): Promise<SfuDiagnosticsSnapshot | null> {
  const pc = this.pc;
  const publishState = this.localPublishState();
  const partial = {
    publishPhase: this.publishPhase ?? null,
    hasPc: !!pc,
    publishStatus: publishState?.status ?? null,
    publishError: publishState?.error ?? null,
  };
  if (!pc || !publishState) {
    // Return enough to surface the stall
    return {
      cfSessionId: publishState?.cfSessionId ?? '',
      connectionState: null,
      iceConnectionState: null,
      rttMs: null,
      localCandidateType: null,
      remoteCandidateType: null,
      selectedCandidatePair: null,
      outboundTracks: [],
      inboundTracks: [],
      subscribeLatencies: [],
      ...partial,
    } as SfuDiagnosticsSnapshot;
  }
  // ...existing path, also include partial fields in the return at the end
}
```

This means future stalls will show up in DB diagnostics with `publishPhase: 'ice-config'`, `hasPc: false`, `publishStatus: 'publishing'`. Immediately diagnosable.

**(c)** Add the new fields to `SfuDiagnosticsSnapshot` type (probably in `sfu-client.service.ts` or a types file).

## Hard constraints

- DO NOT touch any other file. ICE-config service + backend ICE-config route + sfu-client service only.
- DO NOT remove existing behavior — the timeout is additive. On success it's a no-op.
- DO NOT change `doPublish`'s control flow other than adding phase tagging. The ICE config fetch and pc creation still happen in the same order.
- Keep `lastFetchError` logic intact in the ice-config service.
- Backend timeout uses `AbortController` (universal), not `AbortSignal.timeout()` (newer, may not be available).

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Manual code review — confirm:
   - Frontend timeout = 5000ms; on timeout, returns `DEFAULT_STUN_SERVERS`.
   - Backend timeout = 4000ms via AbortController; on abort, returns null + warns.
   - `publishPhase` is set at every await boundary in doPublish.
   - `collectDiagnostics` returns partial snapshot when pc/publishState are nullish.
4. Probe: with backend running, `curl --max-time 1 http://localhost:4720/api/ice-config` still returns ~7ms (no regression in fast path).
5. Write `validation/fix-publish-stall.md`: files touched, what each does, plus a paragraph on the future-observability win.
6. Commit: `fix(ice-config): timeouts on TURN mint + publish-phase telemetry`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/fix-blocker.md`, do NOT push.
- If `SfuDiagnosticsSnapshot` is used in lockstep elsewhere (e.g., serialized to the DB with a strict schema), adding fields might break consumers — STOP and check the diagnostics-payload assertion path in backend `meeting_session_diagnostics` insert. If the schema is permissive (json blob), proceed.

Final line MUST be: `STATUS: DONE — fix ready for validation`.
