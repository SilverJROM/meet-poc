# B2 — Background upload survives close: backend grace-window + client persist/confirm (codex55, IMPLEMENTER)

**Role:** IMPLEMENTER. **Repo:** ~/websites/meet-poc, branch `main`. **Atomic, ~1-3 tests, tight diff.**

## Requirement (R1 + R2)
A long recording's upload must survive the host ending the call. Two coupled gaps:
1. **Backend session-close race:** `backend/src/modules/recording/index.ts` `/upload` rejects with **409 "no open meeting session"** when `getOpenSessionFor(...)` returns null. But **close-room ends the session** (`closeSessionAndAutoTranscribe(...'host-close-room')`). So a long upload that lands after close 409s and is lost. → Add a **grace window**: accept an upload for a meeting session that ended within the last **5 minutes** (per north-star). Implement a `getRecentSessionFor(roomId, ownerEmail, graceMs)` (or extend the existing query) in `backend/src/modules/sessions/store.ts` that matches `ended_at IS NULL OR ended_at >= now-graceMs`. **KEEP the owner-match 403 gate exactly as-is — do NOT weaken it (security boundary).** Only the session-open (409) check is relaxed.
2. **Client persistence/confirm (JROM: "do it in the background, when i close it persist if needed to confirm upload"):** the `recording-pending-<sessionId>` localStorage marker already exists (set on record start, cleared on confirmed upload — see `frontend/src/app/pages/room/room.page.ts` `flushRecordingForExit` + the rooms/recordings page). **Ensure a reconciliation path:** on next load of the rooms or recordings page, if a `recording-pending-<sessionId>` marker is still set (upload was interrupted by tab close/refresh), the app confirms whether the recording landed and **surfaces/retries** — never silently leaves it lost. Read the current code first; if the reconciliation already exists, tighten/verify it covers the interrupted-close case; if not, add it minimally.

## Reproduce-first (§1.4h)
This is an ISSUE. Before/with your fix, establish the failing case: a unit/integration test that an upload for a **just-ended** session (ended_at = now-10s) currently 409s (broken) and PASSES with the grace window; and that an upload ended **>5min** ago still 409s; and that a **wrong-owner** upload still 403s (gate intact).

## Tests (atomic)
- Backend: grace-window accept (<5min), reject (>5min), owner-mismatch still 403. (Extend `backend/tests/recording.test.ts` or a new focused test.)
- Client: reconciliation confirms/retries a pending marker. (A focused frontend spec if feasible; else assert the reconciliation function's logic.)
Run the touched-scope tests; they MUST be green on your change.

## Constraints
- Owner-match 403 gate UNCHANGED. Grace window = 5 min, named constant.
- Tight diff. No unrelated refactors. No new deferrals/TODOs (pre-live).

## Deliverable
`validation/B2-changes.md`: files touched, the grace-window query, the reconciliation path, test output (PASS), and the reproduce-first evidence (the 409→accept flip).

## Callback contract (MANDATORY)
FIRST action in your reply (before prose): append `[callback] B2 codex55 <STATE> <timestamp>` to `plan/WK_0623/projcore-run-2026-06-25/callbacks/B2.md` (STATE = PROPOSED first if you want plan sign-off, else DONE/BLOCKED). Reply STATUS on the last line: `STATUS: PROPOSED <approach>` (if you want my sign-off before coding — recommended given the security-adjacent gate), or `STATUS: DONE` / `STATUS: BLOCKED <reason>`.
