# Transcripts library: confusing per-speaker row count + missing date/time header

- **Type:** UX improvement
- **Status:** LOGGED — fix later (not blocking the recording sync verification)
- **Raised:** 2026-07-02 · **Handler:** projcore (next batch)

## JROM verbatim
> "why is transciption 4, i expect this to just be on one meeting (as all participants are on one
> room) also add the date and time as a header of the room meeting for easier visualization. log
> this to fix later"
> "ok but if they are on the same meeting i want them under that meeting, not individual entries"
> "and also the full transcript is aggregated"

## Context (screenshot: /app/transcripts)
The Transcripts library lists one row PER per-user recording file (bob, alice, jrom, + one more),
each with its own "Meeting transcript" / "Transcribe" button — for a single meeting with 3
participants this reads as "4 separate meetings" even though they all belong to one session.

## Ask
1. Group/collapse per-speaker recording rows under ONE meeting-session card (session date/time +
   room), not one row per speaker file — the per-speaker rows can be a nested/expandable detail,
   not the primary list item.
2. Add a clear date + time header per meeting/session in the library for easier visual scanning.
3. The ONE meeting card's primary action should open the already-aggregated merged transcript
   (all speakers, one timeline) — not force JROM to pick a per-speaker row first to get there.

## Already works (backend, confirmed 2026-07-02)
The full-meeting aggregation JROM wants already exists and is verified correct: `GET
/api/recordings/named-transcript/:sessionId` merges every per-user transcript into one
timeline, offset by each speaker's join time (mid-joiner sync fix, commit 24a8629). The
frontend already calls it — `transcripts.page.ts:viewMeetingTranscript()` → `getNamedTranscript()`
— wired to each row's "Meeting transcript" button. So this issue is PURELY the list/grouping
UI (one row per meeting instead of one row per speaker-file), not a data or aggregation gap.

## Notes
- Root session id ties the rows together already (`?session=<id>` works server-side); this is a
  frontend grouping/display change on the transcripts-page component, not a backend change.
