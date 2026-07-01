# Batch-SS scenarios (R7)

## R7a — no self-mirror
**Given** the local user starts screen sharing
**When** they look at their own share-stage
**Then** they see a "You're presenting" placeholder (desktop icon + text), no `<app-tile>` and
no `<video>` element rendered in `.share-stage` at all.
Covered by: `presenting-placeholder.spec.ts` (new), `share-reflow.spec.ts` FIXC3.1,
`meet-ui.spec.ts` DR-26 "share layout keeps presenter large with participant strip".

## R7b — remote unaffected
**Given** the local user is sharing their screen
**When** a remote guest is in the call (or joins while the share is live)
**Then** the guest's `.share-stage` shows a live `<video>` inside an `<app-tile>` (the actual
shared content), NOT a placeholder.
Covered by: `presenting-placeholder.spec.ts` (new) — host shares first, guest joins into the
live share and immediately sees the animated "Shared screen" canvas content (screenshot:
`remote-sees-share.png`).

## R7c — clean toggle
**Given** the local user is sharing
**When** they stop sharing
**Then** their own view returns to the normal tiles grid (share-layout class removed, no
share-stage), and starting/stopping doesn't touch the self-PIP/camera-strip tile (still
driven by `effectiveLocalStream`, untouched by this diff).
Covered by: `presenting-placeholder.spec.ts` (new), `share-reflow.spec.ts` FIXC3.1 (existing
grid-return assertion, untouched).

## Reproduce-first
Before this fix, `shareStream()` returned the local presenter's own `screenStream()`, and the
template rendered it through `app-tile` (forceVideo=true) regardless — i.e. the presenter
always saw a live self-view of their own share, which is the infinite-mirror JROM reported
when the shared surface included the call tab. `presenting-placeholder.spec.ts` asserts
`.share-stage` has zero `<video>`/`app-tile` elements for the local presenter, which fails
against the pre-fix code (confirmed via `git stash` re-run during implementation).
