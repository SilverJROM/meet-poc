# Late-Joiner Media State Fix Validation

## Timeline

- A three-user real-browser test showed the late joiner receiving decoded video frames for existing peers while the UI still rendered avatars.
- Diagnostics confirmed SFU subscribe and `pc.ontrack` were working; the stale state was in the room identity model.
- Existing peers now re-broadcast their current media state whenever they receive `peer-joined` or `peer-resumed`, so the joining or resumed peer learns the current mic/camera/screen state without a backend protocol change.

## Root Cause

The backend `admitted` payload includes existing peer identity records but does not include per-peer media state. The frontend initialized those existing peer identities with `camEnabled: false`, and existing peers did not broadcast media state again unless they toggled media. A late joiner could therefore have live inbound video tracks while `showVideo()` stayed false because `peerIdentities[peer].camEnabled` remained false.

## Fix Scope

- `frontend/src/app/pages/room/room.page.ts`
  - Re-broadcast local media state after handling `peer-joined`.
  - Re-broadcast local media state after handling `peer-resumed`.
- `e2e/tests/fixloop-banner/multipeer.spec.ts`
  - The multi-peer test now joins every participant with camera enabled.
  - After remote tiles connect, it verifies connected remote tiles render `<video>` and no `.camera-off-avatar`.

## Validation

- `cd backend && npm run build` - PASS.
- `cd frontend && ng build` - PASS.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/multipeer.spec.ts --reporter=line` - PASS, 1/1.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 5/5.
