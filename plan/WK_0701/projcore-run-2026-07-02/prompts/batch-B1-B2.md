Implement R1+R2 from og-requirements.md: group the Transcripts and Recordings library pages by
meeting session instead of one row per recording file.

Read plan/WK_0701/projcore-run-2026-07-02/og-requirements.md first for full acceptance criteria
and JROM's verbatim quotes.

## Files to change
- frontend/src/app/pages/transcripts/transcripts.page.ts
- frontend/src/app/pages/transcripts/transcripts.page.html
- frontend/src/app/pages/transcripts/transcripts.page.scss
- frontend/src/app/pages/recordings/recordings.page.ts
- frontend/src/app/pages/recordings/recordings.page.html
- frontend/src/app/pages/recordings/recordings.page.scss

Backend is OUT of scope — `GET /api/recordings/named-transcript/:sessionId` already works and is
verified correct (mid-joiner sync fix, commit 24a8629). Do not touch backend/.

## The Recording type (frontend/src/app/services/recordings.service.ts) already has what you need
```ts
export type Recording = {
  filename: string; sizeBytes: number; sessionId: string | null; roomId: string;
  roomTitle: string; uploadedAtIso: string; hasMetadata: boolean; speakerCount: number | null;
  durationMs: number | null; hasTranscript: boolean;
  transcribeStatus: 'ready' | 'pending' | 'failed' | null;
};
```
Grouping key = `sessionId`. Recordings with `sessionId === null` (older/edge-case data) each
become their OWN singleton group (do not drop them, do not force them into one bucket together —
R2d).

## Design for BOTH pages (apply consistently)

1. Add a `meetingGroups` computed signal that groups `recordings()` by `sessionId`:
   - Non-null sessionId → one group per sessionId, containing all recordings sharing it.
   - Null sessionId → one singleton group per recording (keyed by filename so it stays unique).
   - Each group needs: a stable `key` (sessionId or `no-session:${filename}`), `roomTitle` (from
     the first recording in the group), a representative timestamp for the header — use the
     EARLIEST `uploadedAtIso` in the group (the meeting's start-ish point, not the last-uploaded
     file), and the list of member `Recording[]`.
   - Sort groups by that representative timestamp, newest first (matches current list order).
   - Keep this as a pure `computed()` derived from the existing `recordings` signal — do not
     change how `recordings()` itself is fetched/paginated.

2. Template: replace the flat `@for (recording of recordings(); ...)` list with an outer
   `@for (group of meetingGroups(); track group.key)` rendering ONE "meeting card" per group:
   - **Header** (R1b/R2b): room title + a clearly-formatted date AND time (e.g.
     `{{ group.whenIso | date: 'EEE, MMM d, y · h:mm a' }}` — readable, not a raw ISO string).
     If the group has >1 recording, also show a short indicator (e.g. "3 speakers" / "4 files")
     so JROM still sees at a glance that it's a multi-participant meeting.
   - **Primary action:**
     - Transcripts page (R1c): if `group.sessionId` is set, the card's primary button opens the
       aggregated meeting transcript directly via the EXISTING `viewMeetingTranscript(recording)`
       method (pass any recording from the group that has a sessionId — they all share one).
       Do not require JROM to expand the card first to reach this button.
     - Recordings page (R2): no aggregated "view" exists on this page today — the card's header
       is informational; per-file actions (download/delete/select) live in the expandable detail
       (below). Do not invent a new aggregate action that doesn't exist server-side.
   - **Expandable per-file detail** (R1d/R2c): a toggle (chevron button or `<details>`) reveals
     the EXISTING per-recording row markup UNCHANGED — same actions, same bindings, same
     `(click)` handlers as today (transcribe / view transcript / download / delete / bulk-select
     checkbox on the recordings page). Do not remove or rename any existing action. Default
     state: collapsed when the group has >1 recording (reduces clutter, matches JROM's ask);
     for a singleton group (1 recording, e.g. sessionId null), you may render it expanded by
     default since there's nothing to hide.
   - Recordings page: the bulk-select bar / "select all on page" / bulk-delete must keep working
     across ALL groups regardless of expand/collapse state — selection is per-filename, not
     per-group, so this should fall out naturally if you don't change the selection signals.

3. Keep all existing component methods' signatures unchanged (`viewTranscript`,
   `viewMeetingTranscript`, `transcribe`, `downloadTranscript`, `deleteTranscript`,
   `toggleSelection`, `deleteRecording`, `bulkDeleteSelected`, etc.) — they still take a
   `Recording` (or filename), you're only changing how rows are grouped/rendered around them.

4. SCSS: add styles for the new meeting-card wrapper + header + expand toggle, consistent with
   the existing panel/row visual style already in each `.scss` file (don't introduce a new design
   language — extend the existing one, reuse existing CSS variables/classes where sensible).

## Constraints
- Frontend-only. No backend changes.
- Do not delete any existing user-facing action.
- Do not run `ng build` and reload the LIVE pm2 bundle — this app is in production and JROM
  reviews before that ships. A local `npx tsc --noEmit -p tsconfig.app.json` (or equivalent
  Angular build check) to confirm it compiles is expected and sufficient; a full `ng build` for
  local verification purposes only (not deploying it) is also fine.
- Write a short `changes.md` (Codex-style: what changed, why, files touched, any caveat) at
  `plan/WK_0701/projcore-run-2026-07-02/prompts/changes-B1-B2.md` when done.

## Definition of done
Both pages render one card per meeting (grouped by sessionId, nulls as singletons), each card has
a readable date/time header, the transcripts page's primary card action opens the aggregated
transcript directly, and every previously-existing per-file action still works from the expanded
detail. Frontend compiles clean (tsc / build). Report back with the list of files changed and a
one-paragraph summary — I will independently validate with Playwright screenshots against the
locally-served app before this is considered done (I do not accept a self-report as proof).
