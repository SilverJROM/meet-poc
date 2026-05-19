# v2-B8 Decision: Sidebar Width And Collapse

## Decision

Use a docked right sidebar at `min(320px, calc(100vw - 24px))`, collapsed by default, with a 180ms width/max-width transition.

## Rationale

The call grid remains the primary surface. A 320px panel is wide enough for names, badges, status icons, and host actions without making two-person calls feel cramped. The 180ms transition is quick enough for repeated meeting use and avoids a heavy drawer animation.

## Mobile Behavior

At narrow widths the sidebar opens full width under the call layout rather than overlaying controls.
