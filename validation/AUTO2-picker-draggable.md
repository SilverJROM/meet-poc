# AUTO2 Picker Draggable Validation

## Scope
- Ask #2: desktop in-call background picker drag, close, and reopen via settings.

## Commands
- `npm run build -w frontend` — PASS
- `E2E_BASE_URL=http://localhost:4700 npm test -w e2e -- e2e/tests/background-picker-draggable.spec.ts e2e/tests/background-effects.spec.ts e2e/tests/background-host-self-view.spec.ts e2e/tests/fixloop-banner` — PASS, 19/19

## Notes
- Initial Playwright webserver startup hit `EADDRINUSE` on backend port `4720`; validation reran against the existing local `meet-poc-fe` server at `http://localhost:4700`.
- Existing Angular build warnings remain: Stencil empty glob and MediaPipe CommonJS optimization bailout.
