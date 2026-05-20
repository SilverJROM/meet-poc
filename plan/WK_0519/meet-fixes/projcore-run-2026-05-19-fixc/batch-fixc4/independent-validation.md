# Batch FIXC4 Independent Validation

Pending projcore independent validation.

Suggested checks:
- Re-run backend tests: `npm test -w backend`.
- Re-run FIXC4 e2e: `npm test -w e2e -- tests/v3-fixc4-transcript-tools --config=playwright.live.config.ts --workers=1`.
- Re-run expanded Run 1 58-spec command.
- Inspect `screenshots/transcripts-with-download-delete.png`.
