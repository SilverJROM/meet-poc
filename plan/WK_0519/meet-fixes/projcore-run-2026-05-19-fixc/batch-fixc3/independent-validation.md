# Batch FIXC3 Independent Validation

Pending projcore independent validation.

Suggested checks:
- Re-run backend tests: `npm test -w backend`.
- Re-run FIXC3 e2e: `npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1`.
- Re-run expanded Run 1 55-spec command.
- Inspect `screenshots/share-strip.png` and `screenshots/share-collapsed.png`.
