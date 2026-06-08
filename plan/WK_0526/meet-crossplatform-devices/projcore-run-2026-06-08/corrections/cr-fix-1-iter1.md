# CR-FIX-1 correction iter1 — tsc gate FAILS (1 gap)
Projcore independent validation: `npx tsc --noEmit` is NOT 0 (your DONE was premature — tsx passed because it strips types, but the strict tsc gate fails).

ONE gap to fix:
- frontend/src/app/services/remote-audio.service.spec.ts:83 — `FakeMediaStream` declares `private readonly tracks: FakeTrack[]`, but `replaceAudioTrack` (L89-91) reassigns `this.tracks = [track]` → TS2540 "Cannot assign to 'tracks' because it is a read-only property". Fix: drop `readonly` (make it `private tracks: FakeTrack[]`).

Then RE-RUN `cd frontend && npx tsc --noEmit` and confirm exit 0 before STATUS: DONE. Do not change anything else. Re-append CR-FIX-1 STATUS: DONE when tsc=0 (and ng build still green). NO commit.
