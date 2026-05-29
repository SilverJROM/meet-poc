# Final validation — no-SFU-publish fix

## Commits
- `81305fb` fix(ice-config): timeouts on TURN mint + publish-phase telemetry
- `ea9ead3` chore(plan): move fix-publish-stall validation note into plan dir

## Build + deploy
- `cd backend && npm run build` — PASS, 0 errors
- `cd frontend && ng build` — PASS, 0 errors
- `pm2 restart meet-poc-be` — fresh backend (with 4s AbortController on CF TURN mint)
- `pm2 restart meet-poc-fe` — fresh frontend (with 5s client timeout + publish-phase telemetry)
- `curl --max-time 2 http://localhost:4720/api/ice-config` → 200 in 0.35s

## e2e regression check
`fixloop-banner/` suite: **4/4 PASS in 17.4s** — no regression from the fix.

## What this fix does
Three independent improvements stacked into one commit:

1. **Frontend `IceConfigService.fetchIceServers()`** wraps the `/api/ice-config` request in a 5000ms `withTimeout()` helper. On timeout, the catch block logs `[ice-config] /api/ice-config timed out — using fallback STUN` and returns `DEFAULT_STUN_SERVERS`. doPublish proceeds with STUN-only ICE (Cloudflare's own STUN server is hardcoded in addition).

2. **Backend `readCloudflareTurn()`** wraps the CF TURN-mint `fetch(...)` in an `AbortController` with 4000ms timeout. On abort, returns `null` → route falls through to default STUN + any static TURN config. Errors logged.

3. **SFU publish-phase telemetry**:
   - New `publishPhase` signal on `SfuClientService` tracks: `'ice-config' | 'pc-create' | 'offer' | 'cf-session' | 'cf-tracks' | 'set-remote' | 'done'` — set at every `await` boundary in `doPublish`.
   - `collectDiagnostics()` returns a **partial snapshot** when `pc` is null or `localPublishState` is null, including `publishPhase`, `hasPc`, `publishStatus`, `publishError`. Previously it returned `null` and the diagnostics payload silently omitted `sfuDiagnostics`. Now any future stall persists to DB and is immediately diagnosable.

## What this fix DOES NOT do
- Does not change `doPublish`'s control flow — same order, same retries, same error handling.
- Does not change the SFU subscribe path. The subscribe-stuck watchdog from the fix-loop run still arms/fires identically.
- Does not modify any in-call UI, signaling protocol, room lifecycle, or auth.

## Why this is the right diagnosis
Session `bbb04251-e103-4c99-8620-4da69d6e845d` (room 180cce4e7f73, 2026-05-28 06:25 local) shows:
- 21 of 29 jrom-side diagnostics rows had `sfuDiagnostics` missing entirely.
- `collectDiagnostics()` returns null ONLY when `!pc || !publishState`. Both null simultaneously means `doPublish` never reached its first line that sets state.
- Wait — line 577 of pre-fix doPublish: `this.localPublishState.set({ status: 'publishing', ... })`. So publishState SHOULD be set the moment doPublish runs.
- For both `pc` and `publishState` to be null in 21 samples, doPublish was either (a) never called, or (b) hung BEFORE line 577.
- The only blocking await before line 577 is `await this.iceConfigService.getIceServers()` (line 581) — but that's AFTER the publishState set. So publishState should still be visible.

Wait — re-reading the code: `publishState` is set at line 577, ICE config is awaited at line 581. So even if ICE hangs, publishState is non-null.

**This means publishState was being RESET to null AFTER being set, OR was never set in the first place.** Either way, the new telemetry will reveal it next time. The ice-config timeout is a **defensive fix** that prevents an obvious indefinite stall, but the deeper question (why publishState was null when ICE-config hang would still leave publishState='publishing') remains open and is now observable.

Updating the diagnosis: the ice-config timeout is necessary but possibly NOT sufficient. The telemetry will tell us in the next failure.

## What JROM needs to do
1. Open two browsers (or one + incognito) at `http://localhost:4700/` (or `https://voice.silverjrom.app/`).
2. Sign in as host in one, navigate to TEST_ROOM01 or any room.
3. In the other browser, navigate to `/join/<slug>` and join as guest.
4. Confirm:
   - Both peer tiles transition CONNECTING → CONNECTED within ~5s
   - Audio + video flow both ways

If it STILL fails: open browser DevTools console on the host side and copy the `[sfu] ...` warnings + the new diagnostic logger output. Submit and we'll see the publish-phase value at stall.
