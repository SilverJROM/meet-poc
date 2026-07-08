# OG Requirements — Library UX: group by meeting (2026-07-02)

Source: JROM chat feedback while reviewing the recording→transcription mid-joiner sync fix
(plan/WK_0701/list/2026-07-02-transcript-library-ux.md has the full verbatim quotes + context).

## R1 — Transcripts library groups by meeting, shows date/time header, opens aggregated transcript
JROM verbatim: "why is transciption 4, i expect this to just be on one meeting (as all
participants are on one room)" / "ok but if they are on the same meeting i want them under that
meeting, not individual entries" / "and also the full transcript is aggregated" / "also properly
add a header the time and date of the call on that room for easier visualization"

Acceptance:
- (a) `/app/transcripts` shows ONE card per meeting session (grouped by `sessionId`), not one row
  per per-user recording file.
- (b) Each meeting card has a clear date + time header.
- (c) The card's primary action opens the aggregated merged transcript (all speakers, one
  timeline) directly — using the existing `GET /api/recordings/named-transcript/:sessionId`
  (already correct/verified, mid-joiner sync fix commit 24a8629).
- (d) Per-speaker recordings remain reachable (expand/detail) with existing actions intact:
  transcribe, add transcription version, delete, download — no functionality removed.

## R2 — Recordings library gets the same meeting-grouping treatment
JROM verbatim: "while your at it fix the ui on recordings as well"

Acceptance:
- (a) `/app/recordings` shows ONE card per meeting session (grouped by `sessionId` when present),
  not one row per recording file.
- (b) Each meeting card has a clear date + time header.
- (c) Per-file rows (per-user + mixed) remain reachable (expand/detail) with existing actions
  intact: download, delete, bulk-select/bulk-delete.
- (d) Recordings without a `sessionId` (older data, if any) still render sensibly (ungrouped
  single-file card, not dropped).

## Out of scope
- Backend changes — the aggregation endpoint already works correctly (verified 2026-07-02).
- Deploying to live (voice.silverjrom.app) — build + local verification only; JROM reviews before
  `ng build` + pm2 reload of the live bundle.
