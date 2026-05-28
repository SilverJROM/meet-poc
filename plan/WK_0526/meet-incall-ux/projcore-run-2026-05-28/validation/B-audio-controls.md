# Batch B validation - audio controls

## Changed files

- `frontend/src/app/services/remote-audio.service.ts`
- `frontend/src/app/components/controls-bar/controls-bar.component.ts`
- `frontend/src/app/components/controls-bar/controls-bar.component.html`
- `frontend/src/app/components/controls-bar/controls-bar.component.scss`

## Implementation evidence

- Added `mutedAll` and `volume` signals to `RemoteAudioService`.
- `setMutedAll()` applies gain `0` when muted and restores the current volume when unmuted.
- `setVolume()` clamps to `0..1.3`, persists to `localStorage` key `meet-poc:volume:value`, and updates the GainNode in real time unless speaker mute is active.
- The GainNode still feeds the existing `MediaStreamAudioDestinationNode`; no WebAudio graph topology change.
- Controls bar speaker button now toggles incoming-audio mute, flips high/mute icons, and applies red `.muted` styling.
- Speaker chevron opens a dismissible popover with a vertical native range input, `0..1.3` max, a 100% marker, and percent text with `(amp)` above 100%.
- Combined mic+speaker mute state is indicated by a small red dot on the speaker split control.

## Verification

- `cd backend && npm run build` - PASS
- `cd frontend && npx ng build` - PASS
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 8/8

## Optional test note

No new permanent Playwright spec was added; direct GainNode access through the app's debug surface would require extra harness plumbing beyond this scoped UI slice.
