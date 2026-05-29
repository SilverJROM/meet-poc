# Deep-dive consultation — no-SFU-publish bug

We thought the audio-silence run + fix-loop closed out CONNECTING issues. JROM tried again on **local** (not just deployed) and it STILL didn't work. New diagnostics paint a different picture — this is not the audio-track race we fixed; it's deeper.

## What the diagnostics say (session `bbb04251-e103-4c99-8620-4da69d6e845d`, room `180cce4e7f73`)

- JROM joined at 2026-05-28 06:25:48; Yo joined at 06:26:52; session ended 06:27:39.
- 20 diagnostic samples captured from jrom's browser. **ALL 20 have `sfuDiagnostics: null`** (the field is absent / not present in payload_json).
- `collectDiagnostics()` returns null only when `!this.pc || !this.localPublishState()`. Both being null = `doPublish` never ran (or was reset to null and stayed reset).
- The non-local peer "Yo" appears in `peers[1]` with `connectionState: 'new'`, `iceConnectionState: 'new'`, `candidatePairCount: 0`, `signalingState: 'stable'` — i.e., zero SFU subscribe activity from jrom's side toward Yo.
- jrom's `outboundAudio.source = "stream"` (NOT `"sender"`). A successful publish would have the audio in `pc.sender`, source `"sender"`. So jrom's audio was never attached to any PC.
- WS signaling itself is healthy: jrom is admitted as OWNER, Yo knocked, was admitted (logs show `+ OWNER` then `ADMITTED Yo`).
- No backend SFU errors logged. Backend was freshly restarted at 5:50 AM (after I killed stale May-22 processes); JROM tested at 6:25 AM — well after the restart.

## Hypothesis space (ranked by my prior)

1. **The admitted-handler IIFE never reaches `await this.sfuClient.publish(...)`** — but the IIFE is small and the poll cap is 1.5s; I can't see what would make it hang or throw silently. The only awaits in the poll are `setTimeout(100)`.
2. **`localPublishState` is being reset to null by another code path AFTER publish set it** — `closeLiveTracksForExit()` sets pc=null AND publishState=null. If this gets called during the session (not on exit), state is wiped. Where could it be called inadvertently?
3. **The IIFE swallows an error before publish via the `.catch`** — if `this.media.localStream()` were undefined-shaped (not a function) due to some import/build issue, the loop body could throw. Unlikely but possible.
4. **The feature run broke something** — fix-loop B1+B2 stack added the 1.5s poll + watchdog. Features-B1 added backend WS handler changes. Could the WS messaging contract have shifted such that the `admitted` message body misses `participantId` or `sessionId`? If so, `if (msg.participantId && msg.sessionId)` is false → IIFE never spawned.
5. **CF Realtime API broken / auth shifted** — but if /sfu/session fails, publish errors → publishState='error', not null. So this doesn't explain null.

## What I need from you

**STOP and read these files (in order)** before responding:

1. `frontend/src/app/pages/room/room.page.ts:944-967` — the admitted-handler IIFE (the 1.5s-poll + publish).
2. `frontend/src/app/pages/room/room.page.ts:1486-1500` — what `cleanupCall()` does, especially relative to `closeLiveTracksForExit()`.
3. `frontend/src/app/pages/room/room.page.ts` — find every call to `cleanupCall`, `directLeave`, `closeLiveTracksForExit`. Could ANY of them fire DURING a normal session (e.g., on a page lifecycle event, visibilitychange, WS reconnect, navigation)?
4. `frontend/src/app/services/sfu-client.service.ts:572-674` — `doPublish` start-to-finish. Particularly the early-fail paths.
5. `frontend/src/app/services/sfu-client.service.ts:158-167` — `collectDiagnostics`. Is there ANY way it returns null when both pc and publishState are populated? (e.g., `pc.getStats()` throwing?)
6. The full backend `admitted` message construction in `backend/src/modules/signaling/index.ts` (around line 835 where it sends `{ type: 'admitted', clientId, participantId, ... }`). Verify `participantId` and `sessionId` are non-empty for an authenticated owner like JROM.
7. The diagnostics payload at `room.page.ts:1864-1887` (`buildDiagnosticsPayload`) — if `sfuDiagnostics` is undefined when `collectDiagnostics()` returns null, it would NOT be present in the JSON. Confirm that's exactly what happened.

## Reply format

```
STATUS: PROPOSE-DIAGNOSIS

ROOT CAUSE (best-evidence hypothesis):
<one paragraph>

EVIDENCE TRACE:
- line/file → observation
- line/file → observation

WHY MY HYPOTHESIS RANKING WAS RIGHT/WRONG:
<one paragraph>

PROPOSED FIX (minimum diff):
- File: path
  Change: what (without writing the code yet)
  Why: reason

VERIFICATION PATH:
- What 2-browser test sequence proves the fix
- What new diagnostic should we add so this is observable next time
```

**Do NOT write code yet.** I'll greenlight the fix after we agree on the root cause.
