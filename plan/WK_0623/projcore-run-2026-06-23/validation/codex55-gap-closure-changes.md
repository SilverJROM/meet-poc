# codex55 gap-closure changes

## Scope

Closed the two regression-guard gaps from `validation/codex55-revert-audit.md` with test code and CI wiring only.

## Files touched

- `backend/scripts/test_owner_labeling.py` — Extended the Python guard to cover mixed/non-per-user skip behavior and versioned local transcript sidecar output with owner labels and zero `?`.
- `backend/tests/transcribe-python.test.ts` — Added a Vitest wrapper that runs `scripts/test_owner_labeling.py`, so `npm test -w backend` now executes the Python guard.
- `backend/tests/signaling-background-relay.test.ts` — Added a WebSocket regression test proving `media-state.background` is relayed to admitted peers.
- `frontend/src/app/components/tile/tile.component.spec.ts` — Added Angular TestBed coverage for camera-off image background rendering, `.initials-chip`, local image URL use, and remote relayed built-in background descriptor rendering.
- `frontend/angular.json` — Added a `test` target using `@angular/build:unit-test` with Vitest.
- `frontend/tsconfig.tile-spec.json` — Added a focused test tsconfig for the tile guard, avoiding unrelated stale frontend specs.
- `frontend/package.json` / `package-lock.json` — Added `jsdom` dev dependency required by Angular's Vitest jsdom test environment.

## Assertions added

- Python transcription:
  - `label_words_with_owner` and `build_lines` never emit `?`.
  - `transcribe()` returns `0` for a mixed/non-per-user recording, prints `skipped: not a per-user recording`, and writes no transcript or primary pointer.
  - `transcribe()` writes `<file>.transcript.local-small.json` for a per-user recording, writes the primary pointer, and labels every line/word with the participant owner.
- Signaling relay:
  - An admitted owner sending `media-state` with `background: { kind: 'image', id: 'city' }` causes an admitted guest to receive the same background descriptor.
- Tile render:
  - A local camera-off peer with an image background renders `.camera-off-avatar.has-bg-image`, applies a `background-image`, renders `.initials-chip`, and does not render the fallback `.avatar-initials`.
  - A remote camera-off peer with a relayed built-in descriptor renders `/assets/backgrounds/city.svg` and the remote initials chip.

## Verification

- `python3 scripts/test_owner_labeling.py -v` from `backend/`: PASS
  - `Ran 4 tests in 0.002s`
  - `OK`
- `npm test -w backend -- transcribe-python.test.ts signaling-background-relay.test.ts`: PASS
  - `Test Files  2 passed (2)`
  - `Tests  2 passed (2)`
- `npm test -w frontend -- --watch=false --include=src/app/components/tile/tile.component.spec.ts`: PASS
  - `Test Files  1 passed (1)`
  - `Tests  2 passed (2)`
- `npm test -w frontend`: PASS
  - `Test Files  1 passed (1)`
  - `Tests  2 passed (2)`
- `npm test -w backend`: PASS
  - `Test Files  33 passed | 1 skipped (34)`
  - `Tests  237 passed | 1 skipped (238)`

## Revert-sensitivity proof

No temporary production-source break was performed. The guards are direct: reverting local owner-labeling/versioned sidecar/mixed skip breaks the Python guard through the backend Vitest wrapper; reverting signaling background relay breaks `signaling-background-relay.test.ts`; reverting tile image-background/initials rendering breaks `tile.component.spec.ts`.

## Caveats

- `npm install -w frontend -D jsdom` reported existing audit findings (`16 vulnerabilities`); no audit remediation was in scope for this test-only gap closure.
