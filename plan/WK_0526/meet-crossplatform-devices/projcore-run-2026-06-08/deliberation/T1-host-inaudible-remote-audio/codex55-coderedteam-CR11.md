# codex55 CODE red-team CR11 (lens L11: security closure + final sweep)

## clientKey/credential closure: complete (old+new, all paths)? admission intact? other exposed secret? (file:line)

Complete for the `clientKey` credential thread.

- New diagnostics rows: `appendDiagnosticsEntry()` still reads `payload.clientKey` into internal `participantClientKey` before persistence, then strips it out of `persistedPayload` before `JSON.stringify()` writes `payload_json` (`backend/src/modules/sessions/store.ts:272-283`). That keeps matching material while removing the raw key from stored readable payload JSON.
- Legacy diagnostics rows: every diagnostics entry object is built through `toDiagnosticEntry()`, which calls `parsePayload(row.payload_json)` (`backend/src/modules/sessions/store.ts:104-119`). `parsePayload()` rejects non-object JSON and strips top-level `clientKey` before returning payload (`backend/src/modules/sessions/store.ts:539-545`), so old rows with raw `payload_json.clientKey` are redacted at read time.
- Read-path coverage: the only `parsePayload(row.payload_json)` site is `toDiagnosticEntry()` (`backend/src/modules/sessions/store.ts:118`). Both entry-returning DB reads flow through it: session detail entries (`backend/src/modules/sessions/store.ts:388-421`) and single inserted entry echo (`backend/src/modules/sessions/store.ts:466-478`). Download JSON reuses `getDiagnosticsForSession()` and `mapDiagnosticEntry()` (`backend/src/modules/sessions/index.ts:143-152`). The diagnostics list endpoint returns summaries only, with no payload (`backend/src/modules/sessions/index.ts:115-126`; `backend/src/modules/sessions/store.ts:336-385`).
- `participant_client_key` is not returned: the `DiagnosticEntryRow` type has no field for it (`backend/src/modules/sessions/store.ts:68-82`), the detail/single-entry SELECT lists omit it (`backend/src/modules/sessions/store.ts:411`, `backend/src/modules/sessions/store.ts:470`), and `mapDiagnosticEntry()` returns only `participantId`, `participantName`, and sanitized `payload` (`backend/src/modules/sessions/index.ts:56-70`).
- Admission/reconnect remains intact: POST admission still reads `body.clientKey` before append (`backend/src/modules/sessions/index.ts:155-168`), and the internal DB column remains populated for durable attribution/matching (`backend/src/modules/sessions/store.ts:273`, `backend/src/modules/sessions/store.ts:288`, `backend/src/modules/sessions/store.ts:295-314`). Signaling durable identity/reconnect logic still uses in-memory `clientKey` matching rather than diagnostics response payloads (`backend/src/modules/signaling/index.ts:413-426`, `backend/src/modules/signaling/index.ts:497-525`).
- Other secrets/tokens: no diagnostics admin/export bypass found. `cfSessionId` remains in SFU diagnostics (`frontend/src/app/services/meeting-sessions.service.ts:333-353`, `frontend/src/app/services/sfu-client.service.ts:900-916`), but it is already signaled to room participants as roster/presence metadata (`frontend/src/app/services/ws.service.ts:47-48`) and is not sufficient to call backend SFU routes: those routes require `clientKey`, `participantId`, and `sessionId`, then verify admission/ownership (`backend/src/modules/realtime-sfu/index.ts:47-64`, `backend/src/modules/realtime-sfu/index.ts:91-110`, `backend/src/modules/realtime-sfu/index.ts:119-129`). I do not classify `cfSessionId` as an exposed bearer credential.

Verification run:

- `npm test -w backend -- tests/session-diagnostics.test.ts` PASS: 14/14, including legacy row redaction and durable guest repost/reconnect cases.
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts && npx tsx frontend/src/app/services/sfu-client.spec.ts && npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` PASS.
- A first frontend attempt using `npm test -w frontend -- --run ...` was invalid because this package uses Angular CLI `ng test`, not Vitest-style `--run`.

## Whole-diff final sweep: any remaining bug (any class)? (file:line) or "none"

none

Fresh sweep notes:

- Remote audio ownership is centralized in hidden body-mounted audio elements, not tile-local audio elements (`frontend/src/app/components/tile/tile.component.html:11-18`, `frontend/src/app/services/remote-audio.service.ts:450-542`). `syncPeers()` registers all non-local peers with a live audio track and removes stale publishers (`frontend/src/app/services/remote-audio.service.ts:258-281`).
- Selected speaker routing applies both to normal media elements and remote registry elements (`frontend/src/app/pages/room/room.page.ts:2647-2657`), with default fallback state exposed in diagnostics (`frontend/src/app/services/remote-audio.service.ts:397-422`, `frontend/src/app/services/remote-audio.service.ts:564-570`).
- The unblock/recovery path is driven by registry blocked state and user interaction/keepalive recovery (`frontend/src/app/pages/room/room.page.ts:631-664`, `frontend/src/app/pages/room/room.page.ts:2684-2700`, `frontend/src/app/pages/room/room.page.html:227-233`).
- The voice watchdog samples SFU inbound audio per publisher, clears stale peers, and only marks/replays when inbound bytes/voice energy advance while playout emission is stalled (`frontend/src/app/pages/room/room.page.ts:2709-2823`; `frontend/src/app/services/remote-audio.service.ts:74-123`).
- SFU diagnostics still include inbound stats, media-playout stats, publish debug state, and connection quality (`frontend/src/app/services/sfu-client.service.ts:716-917`). Diagnostics payload includes both SFU diagnostics and remote audio playout state (`frontend/src/app/pages/room/room.page.ts:3517-3555`).

## R1/R2/R3 still hold after security changes?

- R1 holds: host remote audio is no longer tied to tile rendering; registry audio elements are created for every remote peer stream with a live audio track (`frontend/src/app/services/remote-audio.service.ts:258-281`, `frontend/src/app/services/remote-audio.service.ts:450-542`). Output-device selection is applied to remote registry elements (`frontend/src/app/pages/room/room.page.ts:2647-2657`).
- R2 holds: remote audio is not intentionally suppressed by tile mute/video state; tile remote audio elements were removed (`frontend/src/app/components/tile/tile.component.html:11-18`), registry elements set `muted` only from global `mutedAll()` and otherwise use current volume (`frontend/src/app/services/remote-audio.service.ts:240-255`, `frontend/src/app/services/remote-audio.service.ts:572-575`).
- R3 holds: diagnostics still capture the raw debugging facts before backend read redaction. Client payload build still includes `remoteAudioPlayout` and `sfuDiagnostics` (`frontend/src/app/pages/room/room.page.ts:3503-3555`); backend redaction removes only `clientKey` from readable payloads (`backend/src/modules/sessions/store.ts:539-545`), not SFU or playout diagnostic fields.

## NEW bugs (table) or "none"

none

STATUS: CLEAN
