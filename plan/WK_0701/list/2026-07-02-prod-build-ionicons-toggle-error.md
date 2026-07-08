# Pre-existing production-build-only Ionicons error on dynamic icon-name toggle

- **Type:** bug (pre-existing, app-wide, low severity)
- **Status:** LOGGED — fix later, does not block the meeting-grouping UX fix
- **Raised:** 2026-07-02 (surfaced during independent UI-proof validation of the
  transcripts/recordings meeting-grouping fix) · **Handler:** projcore (next batch, low priority)
- **agent:** projcore

## Finding
On the PRODUCTION build only (not the dev build), clicking any element whose `<ion-icon [name]>`
binding dynamically switches between two icon names (a ternary like
`micOn() ? 'mic-outline' : 'mic-off-outline'`) throws a console error:
```
TypeError: c[m] is not a function
    at main-*.js ... at cr.mode.set [as name]
```
Confirmed reproducible on the **pre-existing, unmodified** login page's password
eye/eye-off visibility toggle (`frontend/src/app/pages/login/login.page.html:44`) — so this is
NOT introduced by the 2026-07-02 meeting-grouping UI change (transcripts/recordings pages), which
happens to use the same established pattern for its new expand/collapse chevron.

## Scope
Every dynamic `[name]="cond ? 'a' : 'b'"` ion-icon binding in the app is a candidate: login
password toggle, settings star/star-outline, controls-bar mic/cam/record/speaker-mute icons,
participant-sidebar mic/cam icons, the new transcripts/recordings expand-toggle chevrons.

## Impact observed
Console error only — no visible functional breakage was observed in manual UI-proof (icons still
visually update, page still works) — but a thrown TypeError in production on a hot user
interaction path (mic/camera toggles are used every call) is worth root-causing; there is a risk
it silently breaks some other Angular change-detection cycle depending on where in the render
path it fires.

## Suggested next step
Root-cause whether this is an Angular production-build optimizer (Terser property mangling)
interaction with Stencil/Ionicons' internal icon-loader, and whether pinning
`optimization.styles`/`scripts` settings or an Ionicons version bump resolves it. Reproduce with:
build `ng build --configuration production`, serve, click any mic/cam toggle or the login
password-eye icon, watch console.
