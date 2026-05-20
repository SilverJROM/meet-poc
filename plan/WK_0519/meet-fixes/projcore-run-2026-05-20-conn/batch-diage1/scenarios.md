# DIAGE1 Scenarios

## DR-14 Clickable Room Rows
- Clicking the main body of a room row opens that room.
- Room rows are keyboard accessible with Enter and Space.
- Row controls, including select, Join, Copy link, and Delete, do not trigger row navigation.

## DR-15 Room Slugs
- Room creation generates a slug from the room title plus a fixed random suffix.
- Existing legacy rooms are backfilled with unique slugs before the unique index is created.
- `/room/:slug` resolves to the same room as `/room/:id`.
- The frontend uses slug URLs for list/share links while signaling maps slug-or-id to canonical `room.id`.
- Owners can set a unique custom slug; duplicates, reserved values, empty/invalid, and overlong values are rejected.
- `TEST_ROOM01` remains usable after migration.
