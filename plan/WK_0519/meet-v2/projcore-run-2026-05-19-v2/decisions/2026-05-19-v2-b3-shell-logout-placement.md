# Decision: v2-B3 Shell Logout Placement

## Decision

Place Logout in the app shell topbar instead of inside each child page.

## Rationale

Logout is a global authenticated-session action. Keeping it in the shell makes it available from Rooms, Ongoing, Past, Recordings, Transcripts, and Settings without duplicating page markup.

## Consequences

- Child pages stay focused on their feature content.
- The topbar remains the stable location for account-level controls.
- Future `/app/*` pages inherit logout automatically.
