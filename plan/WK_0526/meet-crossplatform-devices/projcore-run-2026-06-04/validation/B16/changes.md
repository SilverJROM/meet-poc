# B16 Changes

## User Report Verbatim

APPROVED-PLAN with ONE amendment. Your plan is approved as written EXCEPT step 3's fail-loud behavior: do NOT hard-block join when ice-config is exhausted. Hard-blocking would REGRESS open-network users during a transient backend blip (STUN would have connected them fine) — that violates the universal goal in the other direction. Instead, on exhausted retry surface a clear, prominent relay-unavailable warning with TWO actions: [Retry] (re-fetch ice-config — primary remedy, gets TURN for restrictive nets) and [Join anyway] (proceed with the STUN-only fallback — escape hatch so open-network users are not stranded by a momentary outage). The warning must make clear 'you may not connect on restrictive networks'. Keep this in the existing lobby retry/join flow, no new heavy UI. Everything else in your plan (pure decideIceConfigOutcome + iceServersFromConfigPayload mapper, maxAttempts=3 / backoff 250+750ms / 5s timeout, N2 doPublish reusing the SAME resolved relay-capable iceServers, B7 diagnostics-only force-relay + record requested policy and selected-candidate-pair type with normal calls staying 'all', B6 backend accept both TURN_API_Key and TURN_API_KEY keeping current spelling first + TURN configured in health) is APPROVED. Do NOT touch the B11 transport-recovery or B15 signaling state machines beyond the iceServers source. Implement now: build green, unit specs for the pure fns + mapper + backend env/health, deploy DEV (pm2 restart meet-poc-fe meet-poc-be), write validation/B16/ artifacts, then STATUS: DONE. Remember the HONEST note: real restrictive-network connect is JROM's seat — do not claim it proven by e2e.

## Root Cause Mechanism

- B1: `IceConfigService` used to return default STUN after one failed fetch, so the app could silently continue without TURN. Restrictive networks then had no relay path.
- N2: `doPublish()` built publish ICE servers locally with a hardcoded STUN prepend instead of using one shared resolved ICE list.
- B7: diagnostics always emitted `forceRelay:false` and did not record requested policy/candidate-pair summary for relay validation.
- B6: backend only read `TURN_API_Key`; `TURN_API_KEY` was ignored and TURN configured state was not directly observable.

## Per-File WHY

- `frontend/src/app/services/ice-config-utils.ts`: added pure retry decision and ICE payload mapper with TURN TLS 443 preservation.
- `frontend/src/app/services/ice-config.service.ts`: added 3-attempt fetch retry, explicit relay-unavailable fallback state, and TURN health policy/candidate fields.
- `frontend/src/app/services/sfu-client.service.ts`: publish PC now uses the same resolved ICE server list as the rest of SFU transport; normal `iceTransportPolicy` stays `all`.
- `frontend/src/app/pages/room/room.page.*`: lobby relay-unavailable warning now offers Retry and Join anyway; diagnostics can run force-relay and emit requested/actual policy evidence.
- `frontend/src/app/services/meeting-sessions.service.ts`: extended diagnostics payload/snapshot types for requested policy, candidate-pair type, and force-relay result.
- `backend/src/modules/ice-config/index.ts`: accepts both TURN env spellings and exposes `/api/ice-config/health`.
- `backend/tests/ice-config.test.ts` and `frontend/src/app/services/ice-config.spec.ts`: added deterministic B16 unit coverage.

## Honest Restrictive-Network Note

Real corporate/restrictive-network connectivity is not proven by this batch. The code now retries, surfaces relay-unavailable honestly, reuses relay-capable ICE when available, and adds force-relay diagnostics. Actual restrictive-network connection remains JROM's real-device/network validation seat.

## Autonomous Decisions

- Retry constants: 3 attempts, existing 5s per-attempt timeout, backoff 250ms then 750ms.
- Shared ICE strategy: move pure mapping to `ice-config-utils.ts` so publish/main consumers use one resolver without importing Angular runtime in unit specs.
