# Batch M-B1 — Mobile foundations (with platform.service + viewport-fit + Angular SCSS partial setup)

**⚠️ Hard reminder #1 (LANDED FIRST per v2 learning):** **COMMIT BEFORE STATUS: DONE.** Verify clean tree before posting your callback. The rule was broken twice in v2 (B6 + B8 false-alarm). For Run 3 this is the first instruction.

**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.** All decisions are locked. Make autonomous calls per `trust-defaults.md` + log them in `decisions/2026-05-19-v3-mb1-<slug>.md`.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B1 (revised post Codex + Claude-peer reviews — both STATUS: REVISE folded)
**Branch:** `feat/meet-v3-mb1-foundations` — off the v2-B8 HEAD (`5210993`).

**Requirements assigned:**
- **R1.1** — `100vh` + `calc(100vh - …)` → `100dvh` migration (Claude-peer caught the `calc()` gap)
- **R1.2** — 48×48 px touch targets on **lobby + call view + sidebar** (narrowed from "every control" per Codex)
- **R1.3** — Breakpoint system formalized in shared SCSS partial
- **R1.4** — `isMobile()` signal w/ debounced resize
- **R1.5** — Desktop defaults preserved
- **R1.6 (new)** — `viewport-fit=cover` meta tag audit (iOS safe-area-inset prerequisite — Codex catch)
- **R1.7 (new)** — Angular SCSS partial accessibility (includePaths OR per-file `@use` pattern)
- **R1.8 (moved from M-B6)** — `platform.service.ts` exposing `isIOS()`+`isAndroid()` signals
- **R8.1** — Full Run 1 desktop e2e regression at gate
- **R8.2** — Desktop-unaffected spec

Read in full before coding:
- `og-requirements.md` (R1, R8)
- `scenarios.md` (S1.1-S1.5)
- `context-handoff.md` (post-v2 state + Run 3 scope)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` (synthesis of Codex + Claude-peer reviews — supersedes any contradictions)

---

## Expected (acceptance criteria)

### Step 1 — `100vh` + `calc(100vh - …)` migration (R1.1)

Audit:
```bash
grep -rE "100vh|100lvh|100svh|calc\(100vh" frontend/src/app/ frontend/src/styles.scss frontend/src/index.html
```

For each match:
- `min-height: 100vh` → `min-height: 100dvh` (with `100vh` as a fallback line above if the browser-support concern matters)
- `height: 100vh` → `height: 100dvh`
- `calc(100vh - 60px)` → `calc(100dvh - 60px)`
- Any inline `style="height: 100vh"` in TS templates: same

Document any case where a non-`dvh` unit is INTENTIONALLY retained (with a reason).

### Step 2 — 48×48 px touch targets (R1.2, narrowed scope)

Audit interactive controls in:
- `pages/login/*` (login button, eye-toggle)
- `pages/room/*` (lobby form: Join button, camera checkbox, name input; in-call: existing controls bar — already 46px from B7, bump to 48px)
- `components/controls-bar/*` (each icon button)
- `components/participant-sidebar/*` (toggle, kebab, Admit/Reject)
- `components/lobby-preview/*` (Flip camera placeholder for M-B4; device selectors)
- `components/leave-dialog/*` (action buttons)
- `components/meeting-ended-toast/*` (OK button)

Apply CSS to ensure `min-width: 48px; min-height: 48px` on **mobile breakpoint only** (use the new breakpoint mixin from Step 3). Desktop sizes unchanged.

### Step 3 — Breakpoint system (R1.3, R1.7)

Create `frontend/src/styles/_breakpoints.scss`:
```scss
$mobile-max: 1023px;
$desktop-min: 1024px;

@mixin mobile { @media (max-width: #{$mobile-max}) { @content; } }
@mixin desktop { @media (min-width: #{$desktop-min}) { @content; } }
```

**Angular SCSS partial accessibility (R1.7):** pick ONE strategy + log decision:
- (a) `angular.json` `architect.build.options.stylePreprocessorOptions.includePaths: ["src/styles"]` — every component SCSS can `@use 'breakpoints' as bp;` without relative paths
- (b) Every component SCSS that uses the mixin has explicit `@use '../../../styles/breakpoints' as bp;` at top (relative path; brittle but no angular.json edits)

Lean: (a). Document in `decisions/2026-05-19-v3-mb1-scss-includepaths.md`.

Audit existing raw `@media` queries; convert to the mixin. Three places exist post-Run-1: `room@640`, `dashboard@720`, `controls-bar@760` — they can stay if they're cosmetic-not-breakpoint, but ideally convert.

### Step 4 — `isMobile()` signal (R1.4, R1.5)

Create `frontend/src/app/services/viewport.service.ts`:
```typescript
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly isMobile = signal(typeof window !== 'undefined' && window.innerWidth < 1024);

  constructor() {
    if (typeof window === 'undefined') return;
    let timer: any;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.isMobile.set(window.innerWidth < 1024), 250);
    };
    window.addEventListener('resize', onResize, { passive: true });
  }
}
```

Expose for testing via `room.page.ts` (or app.component.ts) effect:
```typescript
window.__meetDebug = { ...window.__meetDebug, isMobile: () => this.viewport.isMobile() };
```

Default to FALSE on desktop-class viewports (R1.5 — desktop is the default path).

### Step 5 — `viewport-fit=cover` audit (R1.6)

Read `frontend/src/index.html`. Verify the viewport meta tag is:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

If `viewport-fit=cover` is missing, add it. (This is required for iOS safe-area-inset CSS to actually do anything — without it, the safe-area-inset values stay at 0.)

### Step 6 — `platform.service.ts` (R1.8, moved from M-B6)

Create `frontend/src/app/services/platform.service.ts`:
```typescript
@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isIOS = signal(/iPhone|iPad|iPod/.test(navigator.userAgent));
  readonly isAndroid = signal(/Android/.test(navigator.userAgent));
  readonly isMobileUA = signal(this.isIOS() || this.isAndroid());
}
```

Note: **`isMobileUA` is the AUDIT signal**, not the cap-enforcement source. M-B2 uses a client-declared `mobile:true` in the WS `join` payload as PRIMARY; this UA-derived signal is secondary for telemetry/audit.

Expose via `__meetDebug.isIOS()` and `__meetDebug.isAndroid()`.

### Step 7 — Tests `e2e/tests/v3-mb1-foundations/`

- `foundations-mobile.spec.ts` (S1.1-S1.4 at 390×844):
  - Static-file scan: assert zero un-resolved `100vh` matches
  - Touch-target audit: each control in lobby + call view has `boundingBox.width >= 48 && height >= 48`
  - `__meetDebug.isMobile()` returns `true`
  - On resize back to 1920×1080 + 300ms wait, returns `false`
- `foundations-desktop-regression.spec.ts` (R8.1 + R8.2): 
  - At 1920×1080, verify `__meetDebug.isMobile() === false`
  - No mobile-specific class names present on `<body>` or root containers (e.g. no `.is-mobile` injected at desktop)
- **Full Run 1 desktop e2e regression run** at gate (`--workers=1`):
  - `tests/v2-b3-shell + tests/v2-b4-tabs + tests/v2-b5-lobby + tests/v2-b6-grid + tests/v2-b7-controls + tests/v2-b8-sidebar` — 40/40 must PASS

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-1/`:
1. `changes.md` — full template + 100vh audit table (file → count → action) + touch-target table (control → width × height) + Angular SCSS strategy choice + viewport-fit=cover before/after
2. `scenarios-implemented.md` (S1.1-S1.5)
3. `test-report.md` — `npm test -w backend` (43/43 unchanged) + B3-B8 desktop regression (40/40) + M-B1 mobile specs
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — `mobile-lobby-touch-targets.png`, `mobile-call-touch-targets.png`, `desktop-rooms-1920x1080.png` (regression baseline), `desktop-call-1920x1080.png`
7. **Decisions:** `decisions/2026-05-19-v3-mb1-<slug>.md` for the SCSS strategy + any non-trivial autonomous calls

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement bottom-sheet, mobile grid variants, or screen-share-hidden — M-B3.
- **DO NOT** implement WebRTC mobile changes — M-B2.
- **DO NOT** implement camera switch or lobby mobile layout — M-B4.
- **DO NOT** modify backend.
- **DO NOT** pollute prod DB (hygiene rule).

## Completion protocol

**COMMIT BEFORE STATUS: DONE.** Verify `git status` is empty before the callback.

```
STATUS: DONE — M-B1 foundations complete: 100dvh + touch targets + isMobile signal + platform.service + viewport-fit + Angular SCSS partial; Run 1 desktop regression 40/40 green
```

Append to `progress.md` AND `callbacks.md`:
```
[projcore callback] v3-mb1 DONE — foundations + platform.service + viewport-fit
```

— /projcore (Claude, Opus, 2026-05-19)
