# Batch ICE Refresh Changes

## User Report
FINAL HARDENING BATCH — ice-refresh (DR-49), projcore v2.2. Frontend `ice-config.service.ts` caches the first ICE-config promise forever, so Cloudflare TURN creds minted with TTL can expire on a long call. Fix frontend ICE-config TTL refresh and add TURN health self-test. Do not change backend mint/cache cadence. Rebuild frontend, clean pm2 restart, verify served and no env leak. This is the FINAL hardening batch.

## Root Cause
`IceConfigService` kept a single cached promise for the life of the SPA. Any later peer connection recreate or relay-policy escalation reused the original TURN username/credential even after the credential TTL window could be stale.

## Files
- `frontend/src/app/services/ice-config.service.ts`: replaced forever-promise cache with a 12-minute successful-response TTL, added `forceRefresh()`, preserved non-blocking STUN fallback, and added the relay-only TURN health probe with guaranteed PC cleanup.
- `frontend/src/app/services/webrtc.service.ts`: added a `forceIceRefresh` PC creation option and uses it for DR-40 failed-PC recreation.
- `frontend/src/app/pages/diagnostics/diagnostics.page.{ts,html,scss}`: surfaced an on-demand, informational TURN health check in `/app/diagnostics`.
- `e2e/tests/v3-ice-refresh/ice-refresh.spec.ts`: added focused Playwright coverage for reachable and timeout health-check paths, including close-count assertions.

## Caveats
- Backend Cloudflare TURN mint/cache cadence was intentionally unchanged.
- Failed ICE-config requests return default STUN for that call and do not poison the successful 12-minute cache.
- Autonomous decisions: none.
