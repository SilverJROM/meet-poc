# Decision: B7 Icon Controls

## Context

B7 replaces text-flip controls with icon-state buttons and needs accessible state without adding a new design system.

## Decision

Use existing Ionicons:

- mic / mic-off outline
- video / video-off outline
- desktop outline
- ellipse / ellipse outline for recording
- call outline for leave

Buttons use 46px square touch targets, action labels via `aria-label`, current state via `aria-pressed`, and visible focus rings.

## Rationale

This keeps controls compact, matches the existing Ionic dependency, and prepares the surface for Run 3 mobile touch targets without changing route or layout architecture.
