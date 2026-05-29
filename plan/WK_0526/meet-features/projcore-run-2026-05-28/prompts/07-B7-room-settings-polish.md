# B7 — UI: room settings polish (R11)

Per `JROM/decisions/2026-05-28-r11-room-settings-scope.md`: R11 = polish the inline room-settings area within each card from B4. No new route, no new page. Group actions into visually distinct sub-sections.

## Scope

Files allowed:
- `frontend/src/app/pages/rooms/rooms.page.html` — only the `.room-actions` block (inside `.room-row`, around lines 118–151)
- `frontend/src/app/pages/rooms/rooms.page.scss` — only the `.room-actions` and any new helper class selectors you add

Files OFF-LIMITS:
- `rooms.page.ts` — no logic change
- All other pages, components, services, backend

## Visual direction (room-as-card with settings panel)

Reorganize `.room-actions` into THREE visually distinct sub-sections (no JS, no collapse — all visible):

### 1. Quick actions (top, primary)
- "Start" button (primary blue, prominent)
- "Copy link" button (secondary)
- Same as today, just visually grouped at the top of the actions area with subtle padding.

### 2. Access (middle)
- A clear small heading or label: "Access" (uppercase, light gray, 11px, letter-spacing 0.5px).
- Open/Close toggle — keep the existing button. Restyle to look like a pill toggle (filled green pill when "Open", outlined gray when "Closed"). Keep all bindings.
- Wait timeout input — keep the input. Add a small `<span>` label like "Lobby timeout" before it (replacing the existing "Wait min" label). Keep all bindings.
- Layout: row, with wait-timeout input sized appropriately (small, ~80px wide, with "min" suffix text after).

### 3. Danger zone (bottom)
- Visual divider above: 1px light gray border-top with `margin-top: 12px; padding-top: 12px;`.
- Small heading: "Danger" (uppercase, red `#d93025`, 11px, letter-spacing 0.5px).
- "Delete" button (existing danger-btn) — keep as-is functionally but optionally restyle to be outlined-red until hover when it fills.

## Hard constraints

- DO NOT change any `(click)`, `[ngModel]`, `[disabled]`, `[checked]`, `(change)` bindings. Restyle and regroup the template wrapper only.
- DO NOT add new TS methods, signals, or computed values.
- DO NOT add new dependencies or icons (existing Ionicons in this area are fine to keep).
- DO NOT touch any other page or component.
- Card structure (room-row, room-card-top, room-meta) stays intact — only the `.room-actions` block is reorganized.
- The bulk-select checkbox, room-meta, and copy-status block all remain untouched.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Manual code review: confirm only `.room-actions` template + related SCSS changed; all bindings preserved (Start → `openRoom`, Copy link → `copyJoinLink`, toggle → `toggleRoomOpen`, wait timeout → `updateWaitTimeout`, Delete → `deleteRoom`).
4. Write `validation/B7-changes.md`: files touched, before/after grouping notes, list of preserved bindings.
5. Commit: `feat(rooms): room-card settings grouping (Quick / Access / Danger)`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B7-blocker.md`, do NOT push.
- If grouping requires touching the TS (e.g., to add a tracking helper for the new sub-sections), STOP and report — this should be a pure HTML/SCSS reorganization.

Final line MUST be: `STATUS: DONE — B7 ready for validation`.
