# M-B1 Scenarios Implemented

## S1.1 — Dynamic Viewport Height

Implemented paired `100vh` fallback plus `100dvh` on page shells and call surfaces, including `calc(100vh - ...)` conversions.

Evidence: `M1.1 viewport audit uses 100dvh fallbacks and no app-local raw media queries`.

## S1.2 — Mobile Touch Targets

Implemented mobile-only 48px targets for lobby, call controls, participant sidebar actions, login eye-toggle/sign-in, device selectors, leave dialog, and meeting-ended toast.

Evidence: `M1.3 mobile lobby and call controls meet the 48px narrowed touch target contract`.

## S1.3 — Shared Breakpoint System

Added `_breakpoints.scss` and converted app-local raw media queries to `bp.max(...)` / `bp.between(...)`.

Evidence: `M1.1 viewport audit uses 100dvh fallbacks and no app-local raw media queries`.

## S1.4 — Mobile Signal

Added debounced `ViewportService.isMobile` and exposed `__meetDebug.isMobile()` for tests.

Evidence: `M1.2 exposes debounced mobile/platform debug signals`.

## S1.5 — Desktop Preserved

Desktop path remains the default. No mobile classes are injected, and desktop call controls keep their existing 46px size.

Evidence: `M1.4 desktop layout remains desktop-sized and mobile-only target changes do not leak`.
