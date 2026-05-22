# B9 Independent Validation - Codex

Validator: Codex independent validator under Claude /projcore (lkvc-38)
Branch/HEAD observed: `feat/sfu-cutover` at `c92f49e` callback chore, validating code commit `920ce49`
Requirement: SR-9 - SFU diagnostics, persisted two-sided
Date: 2026-05-22

## Scope Checked

- `git show 920ce49`
- `frontend/src/app/services/meeting-sessions.service.ts`
- `frontend/src/app/services/sfu-client.service.ts`
- `backend/src/modules/sessions/store.ts`
- `backend/src/modules/sessions/index.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `e2e/tests/sfu-b9-diagnostics/sfu-diagnostics.spec.ts`
- `e2e/tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts`

## Findings

PASS - `920ce49` implements additive SFU diagnostics without changing the DB schema.

- `DiagnosticsPayload` gains optional `sfuDiagnostics?: SfuDiagnosticsSnapshot`.
- The existing `POST /api/meeting-sessions/:sessionId/diagnostics` path is used.
- Backend persistence still writes full `payload_json` to `meeting_session_diagnostics`.
- `summarizeDiagnosticsPayload` keeps existing mesh peer summarization and only adds optional SFU candidate type / relay / peer count extraction when `payload.sfuDiagnostics` is present.

PASS - SFU stats are gathered from the single SFU peer connection.

- `SfuClientService.collectDiagnostics()` calls `pc.getStats()` once.
- `outbound-rtp` stats are collected into `outboundTracks` and mapped to publish tracks by local publish mids where possible.
- `inbound-rtp` stats are collected into `inboundTracks` only after resolving `stat.mid` through `midToEntry`, preserving publisher/track attribution.
- Candidate pair diagnostics include RTT, local candidate type, remote candidate type, and selected candidate pair details.
- Subscribe latency is tracked from `doSubscribeTracks` initiation and finalized after mid reconciliation if `ontrack` could not map earlier, matching the known ordering issue where `ontrack` can fire before `midToEntry` exists.

PASS - Persistence is two-sided and externally visible through the diagnostics API.

- `RoomPage.appendDiagnosticsLog()` awaits `sfuClient.collectDiagnostics()` only in SFU mode and attaches the snapshot to the normal diagnostics payload.
- `MeetingSessionsService.appendDiagnostics()` and beacon fallback continue posting to the existing diagnostics endpoint.
- `GET /api/meeting-sessions/:sessionId/diagnostics` reads the persisted `meeting_session_diagnostics` row and returns the payload containing `sfuDiagnostics`.
- Extra SQLite check after E2E: `/tmp/meet-sfu-b9-val.sqlite` contained `1` `meeting_session_diagnostics` row with the `"sfuDiagnostics"` key.

PASS - Mesh WebRTC service unchanged by `920ce49`.

- `git diff --name-status 920ce49^ 920ce49` does not include `frontend/src/app/services/webrtc.service.ts`.
- No unrelated source changes were identified in the B9 commit diff beyond diagnostics UI display, room diagnostics attachment, SFU client diagnostics, backend summary extraction, B9 test, and plan/callback artifacts.

## Test Execution

Command run exactly as requested:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b9-val.sqlite npm test -w e2e -- tests/sfu-b9-diagnostics tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result:

```text
Running 2 tests using 1 worker

  ✓  1 [chromium] › tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts:57:1 › B4a: two SFU clients each receive audio+video from the other through Cloudflare (5.6s)
  ✓  2 [chromium] › tests/sfu-b9-diagnostics/sfu-diagnostics.spec.ts:25:1 › B9: SFU diagnostics — outbound+inbound stats + subscribe latency persisted to meeting_session_diagnostics (12.9s)

  2 passed (23.9s)
```

B9 E2E assertions confirmed:

- outbound SFU tracks present
- inbound SFU tracks present
- selected candidate pair present
- subscribe latency present with non-null `firstFrameAtMs` and `latencyMs`
- persisted diagnostics detail contains an entry with `payload.sfuDiagnostics`
- diagnostics UI renders the SFU transport section

Additional DB evidence:

```text
meeting_session_diagnostics rows with "sfuDiagnostics": 1
latest SFU diagnostic summary: kind=reconnect, peer_count=2, candidate_types=host,relay, relay_used=1
```

## Verdict

SR-9 is validated for B9 at code commit `920ce49`.

STATUS: VALIDATED-PASS
