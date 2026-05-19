# Decision: B6 Camera-Off Avatar Color

## Context

Camera-off tiles need an initials avatar that is stable across renders but does not require storing user profile colors.

## Decision

Compute an HSL color from a simple deterministic hash of the participant display name:

`hsl(hash % 360, 45%, 30%)`

## Rationale

The result is stable, cheap, and local to the tile component. It avoids new persistence and avoids a one-note palette because hue varies per name.

## Consequences

Changing the display name changes the avatar color. That is acceptable for the current anonymous guest join model.
