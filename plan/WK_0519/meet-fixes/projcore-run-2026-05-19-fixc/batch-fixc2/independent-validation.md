# Batch FIXC2 Independent Validation

Pending projcore independent validation.

Suggested checks:
- Re-run backend tests: `npm test -w backend`.
- Re-run FIXC2 e2e: `npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1`.
- Re-run Run 1 regression 49-spec set.
- Inspect `screenshots/lobby-modal.png` and `screenshots/in-call-dialog.png` for soft-light theme conformance.
