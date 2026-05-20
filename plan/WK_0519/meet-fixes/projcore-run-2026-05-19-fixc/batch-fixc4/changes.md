# Batch FIXC4 Changes

## Source
JROM verbatim from `og-requirements.md`: "next have a way to delete the past meetings, and transcripts, or download transcripts as well" and "the transcripts when downloaded make them the format human readable and not json file..."

## Scope
- Branch: `fix/meet-fixc4-transcript-tools`
- Requirements: R-C-5, R-C-6, and R-C-7.
- Base branch: `fix/meet-fixc3-share-reflow`.

## Files Changed
- `backend/src/modules/recording/index.ts`
- `backend/tests/recording.test.ts`
- `frontend/src/app/services/recordings.service.ts`
- `frontend/src/app/pages/transcripts/transcripts.page.ts`
- `frontend/src/app/pages/transcripts/transcripts.page.html`
- `frontend/src/app/pages/transcripts/transcripts.page.scss`
- `e2e/tests/v3-fixc4-transcript-tools/transcript-tools.spec.ts`
- `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc4/*`

## What Changed
- Added `GET /api/recordings/:filename/transcript.txt`, auth and ownership gated, returning subtitle-style plain text.
- Added `DELETE /api/recordings/:filename/transcript`, auth and ownership gated, removing only `.transcript.json` plus `.transcribe.lock`.
- Preserved existing recording delete and bulk-delete cascade behavior for audio plus sidecars.
- Added transcripts-page Download and Delete transcript row actions.
- Clear the open transcript viewer when the selected transcript is deleted.
- R-C-7 has no new code; existing rooms bulk-delete remains the canonical past-meeting delete path and is verified by backend room tests.

## Self-Verification
- `npm run build -w backend`: PASS.
- `npm run build -w frontend`: PASS.
- `npm test -w backend`: PASS, 65/65.
- `npm test -w e2e -- tests/v3-fixc4-transcript-tools --config=playwright.live.config.ts --workers=1`: PASS, 3/3.
- Expanded Run 1 command including FIXC1-FIXC4, FIXB2, FIXB4, and v2 B3-B8: PASS, 58/58.
- `pm2 restart meet-poc-fe meet-poc-be`: PASS, both online.
- Public smoke: `E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/v3-fixc4-transcript-tools --config=playwright.live.config.ts --workers=1 --grep "FIXC4.1"`: PASS, 1/1.

## Evidence
- Screenshot: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc4/screenshots/transcripts-with-download-delete.png`

## Caveats
- Transcript delete intentionally leaves recording audio and `.meta.json` intact. Users can still remove those through existing recording/room delete paths.
