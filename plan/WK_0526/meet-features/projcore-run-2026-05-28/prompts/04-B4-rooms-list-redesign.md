# B4 — UI: home/rooms list redesign (R8)

Google Meet-inspired redesign of `/app/rooms`. **Visual + layout only — no functional changes.** All existing controls (create, search, bulk select, delete, open/close room, join/host) must keep working identically.

## Scope

Files allowed (rooms page only):
- `frontend/src/app/pages/rooms/rooms.page.html`
- `frontend/src/app/pages/rooms/rooms.page.scss`
- `frontend/src/app/pages/rooms/rooms.page.ts` (ONLY if you need a tiny computed/signal for the new layout — prefer to keep TS untouched)

## Visual direction (Google Meet host home)

- **Background:** soft light gray (`#f8f9fa`) outer, white panels with subtle shadow `0 1px 3px rgba(0,0,0,0.08)`.
- **Header row:** Page title "Your rooms" (h1, ~28px, medium weight) on the left + "New room" primary button (filled blue `#1a73e8`, white text, 8px radius) on the right.
- **Create-room form:** stays functionally but inline-collapse into the header's primary button by default (clicking "New room" expands an inline form OR keep a small panel below the header — implementer choice; whatever's smaller diff). If you keep the panel, give it the same white-card style as room cards.
- **Search:** keep the search input. Style it as a pill input with an inline search icon, max-width 360px, sits below the header row.
- **Bulk bar:** keep functionally; restyle to fit the new card aesthetic — keep checkbox + "X selected" + Delete button, but use the new color palette.
- **Room cards:** convert `room-row` rendering into card style:
  - White card, 12px padding, 8px radius, subtle shadow on hover.
  - Top row: room title (bold, 16px) + status chip (pill, "Open"/"Closed" with semantic color: green for open, gray for closed).
  - Middle row: room code (monospace, small, with a tiny copy icon — wire `(click)` on the icon to copy room.slug-or-id to clipboard with `navigator.clipboard.writeText`; show a transient toast or just briefly swap icon to checkmark for 1.5s).
  - Bottom row: primary "Start" button (or "Join" if you prefer) + secondary "Copy link" button. The link is the full URL `/room/{slug}` or `/join/{slug}` for guest links — pick `/join/{slug}` since that's the guest-facing entry. **Both buttons must wire to existing methods** (openRoom, plus a new tiny method `copyJoinLink(room)` if needed; if any new TS method is required, that's allowed but minimal).
  - The checkbox for bulk-select sits in the card corner (top-left), small + unobtrusive.
- **Guest entry affordance:** Below the header, add a small subtle link: `<a routerLink="/join">Have a code? Join a meeting →</a>`. Light-gray text, no border, just spacing.
- **Empty state:** centered card with icon + "No rooms yet. Create one above." Already in HTML — restyle it.
- **Mobile:** cards stack vertically. The bulk bar collapses to icon-only buttons.

## Hard constraints

- DO NOT change any `(click)` handlers, ngModel bindings, or routing targets that already exist. Only restyle and reorganize the template.
- DO NOT add new HTTP calls, services, or signals beyond the minimum needed for the copy-link affordance.
- DO NOT touch any other page or component.
- DO NOT add new dependencies (no Material, no new icon set — Ionicons are already in use).
- Keep all `aria-*` attributes and accessibility intact.
- Keep keyboard navigation (existing `(keydown)` handlers).

## Acceptance gate

1. `cd backend && npm run build` — 0 errors (no backend changes expected).
2. `cd frontend && ng build` — 0 errors.
3. Manual visual review: open the page mentally / via dev tools — confirm clean cards, status chips visible, primary button standout, search functional.
4. Existing rooms-page functionality (create, search, bulk delete, click-to-open) must still work — code review of preserved handlers.
5. Write `validation/B4-changes.md`: files touched, before/after layout notes, list of preserved handlers (proves no functional drift).
6. Commit: `feat(rooms): Google Meet-style cards + status chips + guest-link affordance`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B4-blocker.md`, do NOT push.
- If a visual change requires touching files outside `pages/rooms/`, STOP and report (no scope creep).

Final line MUST be: `STATUS: DONE — B4 ready for validation`.
