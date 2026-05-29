# Fix — persist + autofill displayName across browser sessions

JROM: "when using the same user auto fill the previous name, i hate to keep retyping the user name when i use the same machine to join"

## Current state
- `GUEST_DISPLAY_NAME_KEY = 'guestDisplayName'` is stored in **sessionStorage** (room.page.ts:2131-2145) — clears on tab close.
- Only used by the `/join/:slug` guest overlay path.
- The main lobby's `displayName` signal is pre-filled from `user.email.split('@')[0]` for authenticated users, but only when `!this.displayName()`. If user types a different name, it's NOT remembered.

## Fix
Switch the storage to **localStorage** (persists across tab closes / browser restarts) and use it as the canonical "last used name" for everyone — authenticated or guest.

### Part 1 — switch sessionStorage → localStorage

File: `frontend/src/app/pages/room/room.page.ts`

In `readGuestDisplayName` (line 2131) and `storeGuestDisplayName` (line 2139), change `window.sessionStorage` → `window.localStorage`. Keep the same key `'guestDisplayName'` (or rename to `'lastDisplayName'` — implementer choice; rename is fine, just keep one canonical name and document it).

### Part 2 — pre-fill main lobby displayName from localStorage

File: `frontend/src/app/pages/room/room.page.ts`

In `bootstrap()` (around line 416-447), modify the prefill logic at line 419. Order of preference:
1. If `displayName()` already has a value (set explicitly, e.g., from a stored signal init), keep it.
2. Else if localStorage `guestDisplayName` is non-empty, use that.
3. Else if user is authenticated, use `user.email.split('@')[0]` as fallback.
4. Else leave empty (user must type).

Specifically replace line 419 logic:
```ts
const stored = readGuestDisplayName();
if (stored && !this.displayName()) {
  this.displayName.set(stored);
} else if (user && !this.displayName()) {
  this.displayName.set(user.email.split('@')[0] || user.email);
}
```

### Part 3 — persist on every name-update

File: `frontend/src/app/pages/room/room.page.ts`

In `updateDisplayName` (around line 516-523), after `this.displayName.set(value)`, also persist:
```ts
storeGuestDisplayName(value.trim());
```

So the localStorage value is always the latest typed value. This means:
- User types "Alice" → press Join → enters call. Next visit, "Alice" is pre-filled.
- User types "Bob" without joining → "Bob" still gets persisted (slight overkill but safe).

(The existing `continueAsGuest` already calls `storeGuestDisplayName` for the overlay path; that still works.)

## Hard constraints
- ONLY touch `frontend/src/app/pages/room/room.page.ts`.
- DO NOT add new signals or change the WS protocol.
- localStorage write/read MUST be in try/catch (already is in the helpers).
- Do NOT auto-prefill the room CODE — only the user's name.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 5/5 PASS (regression check).
4. Manual code review: confirm:
   - `readGuestDisplayName` reads from `localStorage`, not `sessionStorage`.
   - `storeGuestDisplayName` writes to `localStorage`.
   - `bootstrap` prefers stored name over email-derived fallback.
   - `updateDisplayName` persists every typed value.
5. Write `validation/fix-name-autofill.md`.
6. Commit: `feat(lobby): persist + autofill displayName from localStorage across sessions`. One commit.

## Stop conditions
- 3× build failure → STOP.

Final line MUST be: `STATUS: DONE — name autofill fix ready for validation`.
