# Back-to-rooms button missing on /join page (re-request)

- **Date raised:** 2026-05-30
- **Type:** UI fix (re-request — missed yesterday)
- **Status:** RESOLVED (B6 @ 909bec6; NOT yet DEV-deployed — bundled in the held diagnostics/audio deploy awaiting JROM's manual USER-seat pass per NS6)
- **Agent:** projcore → /lead (B6 pipeline)
- **qa_verification:** On /join while SIGNED-IN, a gray back control (arrow + "Back to rooms") shows above the card title and navigates to /app/rooms (the rooms list, not /login). As a GUEST it reads "Back to home" → /. Styling matches the in-call lobby `.lobby-back-link` (gray #5f6368, no underline). Verify on the deployed DEV URL after the bundle deploys — headless proof was 6/6 Playwright PASS @ localhost:4700, 0 console errors.

## JROM verbatim
> "also i dont see a back button from the join page back to the room list i requested this yesterday add this to the list of tasks"

## Note
Yesterday's back link was added to the in-call LOBBY (room page), not the /join entry page. The /join page (join.page.html) only has a "Host sign in" link. Injected as R9 / batch B6 into projcore-run-2026-05-29 (queue end, runs after the audio/diagnostics work).
