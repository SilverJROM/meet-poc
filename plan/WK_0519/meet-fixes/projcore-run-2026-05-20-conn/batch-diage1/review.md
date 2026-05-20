# DIAGE1 Review

## Findings
- No blocking issues found.

## Checks
- Backfill slugs are unique even for duplicate titles because they include the existing room id prefix.
- Custom slugs normalize to lowercase and reject reserved, invalid, id-shaped, overlong, and duplicate values.
- Signaling does not key live rooms by slug; slug-or-id input resolves to canonical `room.id` before live maps and session operations.
- Row action controls stop click/keyboard propagation so delete/copy/select do not navigate.
- Legacy id URLs remain covered by Playwright.

## Residual Risk
- Legacy/direct DB rows inserted without slugs expose their id as the frontend fallback. API-created rooms are slugged.
