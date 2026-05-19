# M-B1 Changes

## User Report

Invoke `$lead` for M-B1, first batch of Run 3 mobile UI/UX. Implement mobile foundations only: `100dvh`, narrowed 48px touch targets, breakpoint partial, `isMobile()` signal, `viewport-fit=cover`, and `platform.service.ts`. Do not implement later mobile batches. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/styles/_breakpoints.scss`
  - Added shared `$mobile-max: 1023px`, `$desktop-min: 1024px`, `mobile`, `desktop`, `max`, and `between` mixins.
- `frontend/angular.json`
  - Added `stylePreprocessorOptions.includePaths: ["src/styles"]`.
- `frontend/src/index.html`
  - Added `viewport-fit=cover` to the viewport meta tag.
- `frontend/src/app/services/viewport.service.ts`
  - Added debounced `isMobile` signal based on `window.innerWidth <= 1023`.
- `frontend/src/app/services/platform.service.ts`
  - Added `isIOS`, `isAndroid`, and `isMobileUA` signals.
- `frontend/src/app/app.component.ts` and `frontend/src/app/pages/room/room.page.ts`
  - Exposed `__meetDebug.isMobile()`, `__meetDebug.isIOS()`, and `__meetDebug.isAndroid()`.
- App SCSS
  - Migrated `100vh` and `calc(100vh - ...)` sites to paired `100vh` fallback plus `100dvh`.
  - Converted raw app-local media queries to the shared breakpoint mixins.
  - Applied mobile-only 48px touch targets to login, lobby, call controls, participant sidebar controls, device selectors, leave dialog, and meeting-ended toast.
- `e2e/tests/v3-mb1-foundations/*`
  - Added static viewport/media-query audit, mobile signal tests, narrowed touch-target audit, and desktop non-leak regression screenshots.

## 100vh Audit

| File | Count | Action |
|---|---:|---|
| `frontend/src/app/pages/login/login.page.scss` | 1 | Added adjacent `100dvh` fallback pair |
| `frontend/src/app/pages/app-shell/app-shell.component.scss` | 3 | Added adjacent `100dvh` fallback pairs |
| `frontend/src/app/pages/room/room.page.scss` | 3 | Added adjacent `100dvh` / `calc(100dvh - 200px)` fallback pairs |
| `frontend/src/app/components/participant-sidebar/participant-sidebar.component.scss` | 1 | Added adjacent `calc(100dvh - 86px)` fallback pair |

The remaining `100vh` matches are intentional browser fallbacks directly paired with `100dvh`; `100lvh` and `100svh` are absent.

## Touch Targets

| Area | Control | Mobile result |
|---|---|---|
| Login | Sign in + eye toggle | Global button/icon rules >= 48px |
| Lobby | Name input, Join button, camera checkbox row | >= 48px |
| Lobby preview | Mic selector, camera selector | >= 48px |
| Call controls | Mic, camera, screen, record, participants, leave | 48px square on mobile |
| Participant sidebar | Host kebab, Admit, Reject | >= 48px |
| Leave dialog | End for all, just leave, cancel | >= 48px |
| Meeting-ended toast | OK button | >= 48px |

Desktop control sizing was preserved; the B7 call controls remain 46px at desktop width.

## Viewport Meta

Before: `width=device-width, initial-scale=1`

After: `width=device-width, initial-scale=1, viewport-fit=cover`

## Angular SCSS Strategy

Chose Angular include paths. See `decisions/2026-05-19-v3-mb1-scss-includepaths.md`.

## Screenshots

- `screenshots/mobile-lobby-touch-targets.png`
- `screenshots/mobile-call-touch-targets.png`
- `screenshots/desktop-rooms-1920x1080.png`
- `screenshots/desktop-call-1920x1080.png`
