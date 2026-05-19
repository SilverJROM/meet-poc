# M-B3 Decision — Mobile Call Layout Strategy

## Decision

Extend the existing `<app-participant-sidebar>` for mobile bottom-sheet behavior instead of adding a separate sheet component.

## Rationale

The sidebar already owns participant rows, waiting-room rows, host-only actions, and count state. Reusing it keeps those action paths single-sourced and limits the batch to layout, mobile interaction, and section visibility.

## iOS Keyboard Handling

Chosen strategy: close the mobile sheet when focus enters an `input`, `textarea`, or `select` inside it.

This follows the brief's recommended simpler path and avoids fragile `visualViewport` offset math. The current sidebar has no primary text-entry workflow, so closing is acceptable and prevents the iOS keyboard from covering sheet content.

## Tap-To-Switch Wiring

The sidebar owns a local `activeSection` signal. In mobile mode, host users see two tab buttons, `In the call` and `Waiting`; only the selected section renders. Non-host users keep the participants section only. Desktop continues rendering both sections stacked.

## Consequences

- Desktop participant behavior remains on the existing component path.
- Future sidebar features automatically inherit mobile rendering if placed in the shared participant/waiting sections.
- If a future mobile text-entry workflow needs to stay open while typing, the keyboard strategy should change from auto-close to `visualViewport` repositioning.
