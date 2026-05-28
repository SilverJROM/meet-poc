# AUTO5 Host Handoff Validation

## Scope
- First non-owner to join an open room before the owner is admitted becomes acting host.
- Acting host can admit/reject pending guests while no owner has joined.
- Owner auto-admits and takes host role from acting host.
- If acting host leaves before owner arrival, the next admitted participant is promoted.
- Frontend host-gated UI follows `host-role` updates.

## Verification
- `npm test -w backend -- signaling-acting-host.test.ts signaling-knock-admit.test.ts signaling-host-actions.test.ts` - PASS, 11 tests.
- `npm run build -w backend` - PASS.
- `npm run build -w frontend` - PASS, existing Angular warnings only.
- `E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 npm test -w e2e -- e2e/tests/auto5-host-handoff/host-handoff.spec.ts` - PASS, 2 tests.
- `E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 npm test -w e2e -- e2e/tests/fixloop-banner e2e/tests/v3-admit/admit.spec.ts` - PASS, 19 tests.

## Notes
- The first e2e attempt used the default ports and was stopped because an existing backend already occupied `4720`; the successful runs used alternate ports.
