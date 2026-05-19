# M-B3 Review

## Findings

No blocking findings.

## Review Checks

- Mobile participant UI is a CSS/logic mode of the existing sidebar, avoiding duplicate participant action logic.
- Desktop sidebar remains non-mobile: no backdrop, no mobile tabs, and no `mobile-mode` class at 1920x1080.
- Mobile sheet uses 75dvh, fixed bottom positioning, visible handle, backdrop close, and swipe-down close.
- Tap-to-switch shows one mobile section at a time and preserves the desktop stacked layout.
- Mobile controls are fixed to the bottom and keep 48px icon-state controls from prior batches.
- Screen-share is absent from the mobile DOM, not just visually hidden.
- Desktop screen-share and desktop control placement are preserved.
- No WebRTC/signaling, recorder, camera-switch, or future tap-to-focus work was added.

## Residual Risk

The iOS keyboard behavior uses the simpler accepted strategy: close the sheet on input/select/textarea focus. This avoids viewport math but means future editable participant controls inside the sheet will need a deliberate UX revisit if they should remain open while typing.
