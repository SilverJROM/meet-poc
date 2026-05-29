# B6 — UI: waiting room / admit polish (R10)

Per `decisions/2026-05-28-consultation-agreements.md` item #9 and `JROM/decisions/2026-05-28-r10-admit-scope.md`: R10 scope = the participant-sidebar "Waiting to join" section + the knock-banner-toast styling polish. Strict no-touch on the rest of the in-call surfaces.

## Scope

Files allowed:
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.html` (Waiting list section only — lines ~72–91)
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.scss` (Waiting list-related rules only)
- `frontend/src/app/pages/room/room.page.scss` (the `.knock-banner` block from fix-loop B1 — just polish)

Files OFF-LIMITS (verify by sweep):
- `participant-sidebar.component.ts` — no logic change
- The "In the call" section, kebab menu, mobile section-tabs, sheet-handle — untouched
- All in-call surfaces: tiles, controls-bar, chat, leave-dialog, share-stage
- Knock-banner HTML — only SCSS polish, no markup change
- Room page HTML — no changes

## Visual direction (Google Meet waiting room)

### Participant sidebar `Waiting to join` section
- Section header: "Waiting to join" + a count badge (small pill, blue `#1a73e8`, white text) showing `knockers().length` when > 0.
- Empty state: keep the existing "No one is waiting." — restyle to centered light gray, small icon if room (Ionicon `time-outline` or `hourglass-outline`).
- Knocker rows (the `@for` block): replace the inline `<span> + buttons` row with a card-style row:
  - Avatar circle (left): 36px round, background = consistent color derived from name (use a simple hash → color helper inline, or pick from a small fixed palette). Show initials (1–2 letters from `knocker.name.trim().split(' ')`).
  - Name (center): bold, ~14px.
  - Two buttons stacked or side-by-side (right): "Admit" (primary blue filled) + "Deny" (secondary outline). Use "Deny" copy to match Google Meet — but if you find the existing `(reject)` event handler is correct (it is), just rename the button label from "Reject" → "Deny". No TS changes needed.
- Subtle entry animation: slide-in from top, fade 150ms ease-out. Use CSS keyframes; no JS.

### Knock-banner-toast polish (room.page.scss .knock-banner block)
- Keep functionality intact. Polish to align with the new aesthetic:
  - Tweak shadow to be slightly stronger: `0 4px 12px rgba(0,0,0,0.18)`.
  - Add a brief pulse-glow keyframe on the border-radius edge for first 800ms after appearance (subtle, 1 pulse) — purely decorative.
  - Avatar circle (same hash-color helper) prepended to each row before the name. Use inline SVG OR a `::before` pseudo if simpler. (If too complex, skip the avatar in the banner — only the sidebar gets avatars. Implementer choice.)
- Do NOT change banner markup, position, or button labels.

## Hard constraints

- DO NOT touch any TS file. All polish is HTML/SCSS.
- DO NOT modify the `In the call` section markup or styles inside participant-sidebar.
- DO NOT modify mobile sheet behavior (section-tabs, sheet-handle, touch handlers).
- DO NOT modify `[aria-*]` attributes; if you add new ones, they must be accurate.
- DO NOT add new components, services, or dependencies. Avatar color helper, if added, lives inline in SCSS via a CSS custom property + `:nth-child` palette, OR is computed in the HTML template via a tiny pure pipe — but a pipe would require a new file which is OUT of scope. So pick the SCSS palette approach: e.g. 8 background colors cycled by `:nth-child(8n+1) {...}` etc.
- The "Reject" → "Deny" copy change: only the button TEXT changes. The `(click)="reject.emit(knocker.id)"` stays.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Manual code review: confirm only allowed files changed, no event handlers renamed, no TS touched.
4. Write `validation/B6-changes.md`: files touched, before/after layout notes, list of preserved event wirings (admit, reject, close).
5. Commit: `feat(admit): waiting-room avatar cards + banner polish`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B6-blocker.md`, do NOT push.
- If implementing avatar colors via SCSS-only would require touching the .ts (e.g., to add a `data-color-index` attribute) — that's permitted ONLY on the participant-sidebar template, NOT on the .ts. If even that gets messy, skip the avatar color variation and just use a single subtle gray. Report what you did.

Final line MUST be: `STATUS: DONE — B6 ready for validation`.
