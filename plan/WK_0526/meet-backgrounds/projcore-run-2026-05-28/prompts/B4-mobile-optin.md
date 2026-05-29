# Batch B4 — Mobile opt-in warning (R21)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore supervises from session `lkvc` and watches `lkvc-codex`. Do NOT invoke `$projcore`, do NOT modify queue/progress/req-matrix/context-handoff/north-star/og-requirements/callbacks. Implement THIS batch only.

## Read first

1. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/context-handoff.md` — what B1+B2+B3 shipped.
2. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/og-requirements.md` § R21.
3. `frontend/src/app/services/viewport.service.ts` — find `isMobile()` API shape.
4. `frontend/src/app/components/background-picker/background-picker.component.{ts,html,scss}` — where you extend.

## No PROPOSED handshake required — tightest UI extension yet.

## Scope

### R21.1 — Inject ViewportService and expose isMobile

In `background-picker.component.ts`:
- Inject `ViewportService`
- Expose a signal-like accessor `isMobile` (use computed wrapper if needed; viewport's existing API is likely already signal-shaped — check the source)

### R21.2 — Warning text in template

In `background-picker.component.html`, ABOVE the existing grid (or wherever makes sense for both inline and overlay presentations), add:

```html
@if (isMobile()) {
  <div class="mobile-warning" role="note">
    Background effects may drain battery and reduce video quality on this device.
  </div>
}
```

The warning text MUST match verbatim: *"Background effects may drain battery and reduce video quality on this device."*

### R21.3 — Warning styling

In `background-picker.component.scss`:
- Subtle warning visual — yellow/amber tint background, small text, small padding, rounded corners
- Should NOT dominate the picker
- Use design tokens if available; otherwise hard-code a tasteful color (`#fff8e1` background, `#7a5d00` text or similar)

### R21.4 — Default off on mobile (first visit)

Add a new localStorage key `meet-poc:bg:mobile-opt-in` (boolean).

Modify `restoreSelection()` logic:
- If `isMobile()` AND `localStorage.getItem('meet-poc:bg:mobile-opt-in') !== 'true'` → skip restoring `meet-poc:bg:selected`; force `selectedId='none'` + `mode='none'`. Do NOT clear the stored selection — just don't apply it.
- Otherwise → restore as before.

Modify `select()`:
- When `isMobile()` AND a non-None option is selected → set `localStorage.setItem('meet-poc:bg:mobile-opt-in', 'true')` before applying.
- When 'None' is selected on mobile after having opted in → fine to leave the opt-in flag (user can re-pick later without re-opting).

### R21.5 — Manual self-check

1. `cd backend && npm run build` — PASS.
2. `cd frontend && ng build` — PASS.
3. Manual desktop: lobby → picker shows NO warning. Pick "Blur" → persists. Reload → still Blur.
4. Manual desktop emulating mobile (Chrome devtools mobile mode triggering viewport.isMobile): lobby → picker shows the warning. Default = None (even if localStorage had Blur from desktop earlier). Click Blur → opt-in stored. Reload → still Blur.
5. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 16/16 PASS.
6. Screenshots:
   - `validation/B4-picker-desktop-no-warning.png` — desktop lobby, picker visible, no warning.
   - `validation/B4-picker-mobile-warning.png` — mobile emulation lobby, picker visible, warning visible above grid.

## Hard constraints

- ONLY touch: `background-picker.component.{ts,html,scss}`, `validation/B4-*`. NO other files.
- DO NOT touch background-effects.service.ts.
- DO NOT touch room.page.ts.
- DO NOT touch viewport.service.ts.
- DO NOT add backend.
- Warning text MUST match verbatim per R21.3.
- localStorage key MUST be exactly `meet-poc:bg:mobile-opt-in`.

## Acceptance gate

1. Code review by projcore: viewport.isMobile() integration works; warning text exact match; mobile-default-off logic correct; opt-in flag persists; desktop unchanged.
2. Build + e2e fixloop-banner green.
3. Two screenshots in `validation/` (desktop NO warning + mobile WITH warning).
4. Write `validation/B4-mobile-optin.md`: files touched, viewport integration, warning placement, default-off semantics, opt-in flag handling.
5. Commit message: `feat(bg): mobile opt-in warning (R21)`.

## Stop conditions

- If `ViewportService` does NOT expose an `isMobile()` signal/method, STOP and report — do NOT add new viewport detection logic. Read viewport.service.ts first to confirm the API shape.
- If overriding restore on mobile breaks the existing B1/B2/B3 desktop paths, STOP — likely means the test condition is wrong.

## Self-check

- [ ] ViewportService injected, isMobile accessible from template
- [ ] Warning text verbatim
- [ ] Warning shows ONLY on mobile
- [ ] Default 'None' on mobile first-visit (even with stored selection)
- [ ] Opt-in flag set on first non-None mobile selection
- [ ] After opt-in, mobile restore behavior matches desktop
- [ ] Desktop behavior unchanged
- [ ] Build + e2e green
- [ ] 2 screenshots saved
- [ ] validation/B4-mobile-optin.md written
- [ ] Single commit with the required message

Final line MUST be EXACTLY: `STATUS: DONE — Batch B4 ready for validation`
