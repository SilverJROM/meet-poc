# B16 Independent Validation

## Result

CLAIMED PASS by implementer self-validation, pending projcore independent gate.

## Evidence

- B1 retry/fail-loud: pure decision tests cover success, retry, exhausted relay-unavailable, and malformed payload. Lobby warning has Retry and Join anyway.
- N2 shared publish ICE: `doPublish()` now calls `this.iceConfigService.getIceServers()` directly and constructs `RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' })`; hardcoded publish STUN prepend removed.
- B7 diagnostics: payload includes `forceRelay`, `requestedIceTransportPolicy`, `selectedCandidatePairType`, and `forceRelayDiagnostic`; force-relay diagnostic uses `iceTransportPolicy:'relay'`.
- B6 backend env/health: tests cover `TURN_API_KEY`, legacy `TURN_API_Key`, and `/api/ice-config/health`.

## Commands

- `npm run build`: pass.
- `npx tsx frontend/src/app/services/ice-config.spec.ts`: pass.
- `npx tsx frontend/src/app/services/sfu-client.spec.ts`: pass.
- `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`: pass.
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`: pass.
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`: pass.
- `npx tsx frontend/src/app/services/media-acquisition.spec.ts`: pass.
- `npx vitest run backend/tests/ice-config.test.ts`: pass.

## Caveat

Full backend test suite is not green due unrelated pre-existing expectation drift outside B16. Real restrictive-network validation is not automated.
