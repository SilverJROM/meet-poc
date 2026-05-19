# Decision: v2-B4 Recordings Count via Filesystem Scan

## Decision

Compute ended-session `recordingsCount` by scanning the recordings directory once per request, filtering through the existing owner-aware recording parser, and grouping v2 filenames by `sessionId`.

## Rationale

Recordings are currently filesystem-only; adding a new recordings metadata table would exceed B4 scope. The scan reuses the existing parser, preserves backward-compatible old recording filenames, and only counts v2 recordings that can be tied to a meeting session.

## Consequences

- Current-scale performance is acceptable for the expected 50-100 session archive size.
- Old v1 recordings without `sessionId` still appear in `/app/recordings` but do not contribute to a session-specific count.
- A future large archive should index recording metadata in SQLite.
