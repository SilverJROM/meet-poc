# AUTO4 Layout Self Minimize Validation

## Scope
- Default non-share call layout now emphasizes remote participants.
- Local self tile renders as a smaller PiP-style overlay when at least one remote peer is present.
- Settings popover includes a persisted Equal-size tiles toggle to restore the previous equal grid.
- Screen-share layout was left on the existing share-stage/share-strip branch.

## Verification
- PASS: `npm run build -w frontend`
- PASS: `E2E_BASE_URL=http://localhost:4713 E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 npm test -w e2e -- e2e/tests/v3-mb3-call-layout/controls-and-grid.spec.ts`
- PASS: `E2E_BASE_URL=http://localhost:4713 E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 npm test -w e2e -- e2e/tests/fixloop-banner`
- PASS: `E2E_BASE_URL=http://localhost:4713 E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 E2E_WS_ORIGIN=ws://localhost:4721 npm test -w e2e -- e2e/tests/v3-fixc3-share-reflow/share-reflow.spec.ts`

## Notes
- The first share-reflow stress run failed because raw WebSocket guests used the default `ws://localhost:4700` while the isolated backend was on `4721`; rerun with `E2E_WS_ORIGIN=ws://localhost:4721` passed.
- The layout spec now covers default 1-on-1 remote dominance, default 3+ participant remote dominance, Equal-size tiles restore, and localStorage persistence across reload/rejoin.
