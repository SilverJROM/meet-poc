# Batch M-B3 — Mobile call layout (bottom-sheet + docked controls + grid + screen-share hidden + iOS keyboard + tap-to-switch tabs)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree before callback.
**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.** Make autonomous calls + log them.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B3 (renumbered post-consult: this is the OLD M-B2 swap content; "Mobile call layout")
**Branch:** `feat/meet-v3-mb3-call-layout` — off M-B2 HEAD.

**Requirements assigned:**
- **R2.1** — Bottom-sheet replaces `<app-participant-sidebar>` on mobile (~75vh, swipe-down dismiss); desktop sidebar unchanged
- **R2.2** — Mobile controls bar docked at bottom w/ safe-area-inset; desktop bar unchanged
- **R2.3** — Mobile dynamic grid (1=full-screen, 2=vstack, 3-4=2x2); desktop grid unchanged
- **R2.4** — Screen-share button hidden on mobile (`toHaveCount(0)` mobile, visible desktop)
- **R2.5** — Per-tile overlays (mute icon / camera-off avatar / HOST badge) work identically on mobile
- **R2.6 (consult add)** — Bottom-sheet handles iOS virtual keyboard (use `window.visualViewport.height` to reposition, OR auto-close sheet when input focuses inside it)
- **R2.7** — Tap-to-switch sidebar sections (placeholder for the deferred swipe-tabs gesture)
- **R8.1, R8.2, R8.5** — Run 1 desktop e2e regression at gate; desktop-unaffected spec; CSS regression screenshots

Read in full:
- `og-requirements.md` (R2)
- `scenarios.md` (S2.1-S2.8)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` (note R2.6 iOS keyboard handling + tap-to-switch placeholder for R4.2 deferred)
- Existing `<app-participant-sidebar>` (target for the mobile bottom-sheet swap)
- Existing `<app-controls-bar>` (target for mobile bottom docking)
- Existing `room.page.{ts,scss,html}` (grid variants live here)

---

## Expected (acceptance criteria)

### Step 1 — Bottom-sheet pattern (R2.1, R2.6, R2.7)

Approach: extend `<app-participant-sidebar>` with `isMobile()`-driven CSS swap (preferred — single component, branches in CSS). OR new `<app-participant-sheet>` sibling component that the parent picks via template `@if (viewport.isMobile())`. Codex picks + logs.

**Mobile mode (when `viewport.isMobile() === true`):**
- Closed by default; toggle from controls bar (people icon + count badge — same as Run 1 B8)
- Open: slides up from bottom, fixed at `bottom: 0`, `width: 100vw`, `height: 75dvh` (use dynamic viewport)
- Visual: rounded top corners, drag-handle bar visible at top
- Dismissal:
  - Swipe down: detect via touchmove deltaY > 60px → close
  - Tap on backdrop (the 25% above the sheet): close
- **iOS keyboard handling (R2.6):** if `window.visualViewport.height < window.innerHeight`, the on-screen keyboard is open → either:
  - (a) Close the sheet automatically OR
  - (b) Reposition `bottom` to `${window.innerHeight - window.visualViewport.height}px`
  Codex picks the simpler one + logs. Lean: (a) — close on input focus inside sheet — simplest.
- **Tap-to-switch sections (R2.7):** the section headers ("In the call", "Waiting to join") become tappable; tapping switches the active section. Replaces the deferred swipe gesture (R4.2 v3.5). Show only one section at a time on mobile (vs both stacked on desktop). Host sees both options; guest sees only "In the call" (no tabs needed).

**Desktop mode (`viewport.isMobile() === false`):** existing Run 1 B8 right-side panel UNCHANGED.

### Step 2 — Mobile docked controls (R2.2)

In `<app-controls-bar>` SCSS, add a `bp.mobile { ... }` block:
- `position: fixed; bottom: 0; left: 0; right: 0;`
- Padding: `padding-bottom: env(safe-area-inset-bottom);` (iOS notch / home indicator)
- Background: solid (so video underneath doesn't show through)
- Horizontal scroll for icon overflow protection on very narrow viewports
- Same Run 1 B7 icon-state buttons + 48px from M-B1

Desktop: existing position preserved (top of call panel, where it currently lives).

### Step 3 — Mobile grid variants (R2.3)

In `room.page.scss`, extend the existing `.tiles-grid[data-count="N"]` rules with `bp.mobile` overrides:
```scss
.tiles-grid {
  &[data-count="1"] {
    @include bp.mobile {
      grid-template-columns: 100%;
      height: calc(100dvh - 140px); // controls bar + safe-area
      /* tile uses object-fit: cover for full-bleed */
    }
  }
  &[data-count="2"] {
    @include bp.mobile {
      grid-template-columns: 100%;  // single column, vertical stack
    }
  }
  // 3-4 stays as 2x2; same as desktop (already works at narrow viewports)
}
```

Desktop variants UNCHANGED. M-B2's 4-peer mobile cap means we never need 5+ tiles on mobile.

### Step 4 — Screen-share button hidden on mobile (R2.4)

In `<app-controls-bar>` template:
```html
@if (!viewport.isMobile()) {
  <button class="control-btn" ...screen-share...>...</button>
}
```

This puts it NOT IN DOM at mobile (passes `toHaveCount(0)` per Run 1 B7 pattern). Desktop unchanged.

### Step 5 — Per-tile overlays sanity check (R2.5)

`<app-tile>` SCSS may have desktop-specific sizing for the HOST badge / mute icon. Audit at mobile viewport — if the overlays become unreadable (too tiny or off-position), add a `bp.mobile` adjustment. Likely no changes needed; just verify with screenshots.

### Step 6 — Tests `e2e/tests/v3-mb3-call-layout/`

- `bottom-sheet-mobile.spec.ts` (S2.1, S2.6, S2.7) — at 390×844: sidebar toggle opens bottom-sheet at 75vh; swipe-down closes; tap-to-switch sections works for host
- `sidebar-desktop-unchanged.spec.ts` (R2.1 + R8.2) — at 1920×1080: clicking sidebar toggle shows the right-side panel, NOT a bottom-sheet (assert via CSS class / DOM structure)
- `controls-docked-mobile.spec.ts` (S2.3 in og + S2.4) — at 390×844: controls bar's `boundingBox().y + height` is within 24px of viewport bottom
- `controls-desktop-unchanged.spec.ts` (R2.2 + R8.2) — at 1920×1080: controls bar in its existing position (NOT bottom-docked)
- `grid-mobile-1peer.spec.ts` (S2.5) — at 390×844, owner alone: tile is full-width AND covers most of the available height
- `grid-mobile-2peer.spec.ts` (S2.6 in og) — at 390×844, two-context: 2 tiles vertically stacked, each ~50% available height
- `screen-share-hidden.spec.ts` (S2.7) — at 390×844: screen-share button `toHaveCount(0)`
- `screen-share-visible-desktop.spec.ts` (S2.8 + R8.4) — at 1920×1080: screen-share button visible
- `desktop-regression.spec.ts` (R8.2) — at 1920×1080: snapshot of /room/:id call view to compare to M-B1 baseline (visual identity check via DOM measurements, no pixel-diff)

**Run 1 desktop e2e regression at gate** (R8.1): 40/40 with `--workers=1`.

### Step 7 — Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-3/`:
1. `changes.md` — full template + bottom-sheet approach choice + iOS keyboard strategy + tap-to-switch UX
2. `scenarios-implemented.md` (S2.1-S2.8 covering R2.1-R2.7)
3. `test-report.md` — backend 45/45 unchanged + Run 1 regression 40/40 + M-B3 mobile e2e + M-B3 desktop-regression specs
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — mobile-bottom-sheet-open.png, mobile-controls-docked.png, mobile-grid-1peer.png, mobile-grid-2peer.png, screen-share-hidden-mobile.png, desktop-sidebar-still-right.png (regression), desktop-controls-top.png (regression)
7. **Decisions:** `decisions/2026-05-19-v3-mb3-<slug>.md` for: bottom-sheet component strategy (extend vs new), iOS keyboard handling choice (close vs reposition), how tap-to-switch sections is wired

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement camera switch — M-B4 lobby.
- **DO NOT** implement MediaRecorder mime fallback — M-B5 iOS.
- **DO NOT** modify WebRTC / signaling.
- **DO NOT** add tap-to-focus-tile (DEFERRED to v3.5).
- **DO NOT** add swipe-between-tabs (tap-to-switch is the v3 placeholder per R2.7).

## Completion protocol

**COMMIT BEFORE STATUS: DONE.**

```
STATUS: DONE — M-B3 mobile call layout + 8 scenarios green + Run 1 regression 40/40
```

— /projcore (Claude, Opus, 2026-05-19)
