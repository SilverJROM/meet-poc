# Fix — publish transceiver direction (sendrecv → sendonly)

JROM's live 2-browser test post-`ffc2286` shows partial success: host sees nothing from guest's video, but guest sees host fine. Diagnostics from session `2b124519`:

- **Guest (Jtest) view of host (JROM)**: video 7.1MB / 2081 frames decoded, `firstFrameAtMs: 1779953217221` — ontrack fired, video renders.
- **Host (JROM) view of guest (Jtest)**: video 8.2MB / 2227 frames decoded — **the browser IS receiving and decoding the RTP** — but `firstFrameAtMs: null` — `pc.ontrack` never fires in JS.

## Root cause

`sfu-client.service.ts:767-774` — publish transceivers are created with `direction: 'sendrecv'`. The receiver slot on a sendrecv transceiver has a pre-created track. When Jtest's tracks arrive via SFU, Cloudflare **attaches them to JROM's existing sendrecv transceivers** (mids already exist; no need to add new ones). Result:
- No new `setRemoteDescription` needed → no renegotiation triggered → the previous race fix doesn't help here (it only helps the renegotiation branch).
- `pc.ontrack` only fires for NEW tracks added via setRemoteDescription. Re-used transceivers do NOT trigger ontrack.
- Yet the receiver's pre-existing track IS where the RTP lands — Chrome decodes it silently.
- JS layer never sees the track → `remoteStreams` signal stays empty → tile stuck CONNECTING.

Guest works because guest joined second and subscribes to host's existing-publisher state via the renegotiation branch (CF returns `requiresImmediateRenegotiation: true` for the first-subscribe scenario when there's an existing publisher).

## Fix

**Change publish transceiver direction from `'sendrecv'` to `'sendonly'`.** This forces CF to add NEW recvonly transceivers for any incoming subscribe — which triggers `setRemoteDescription` renegotiation — which fires `pc.ontrack` — which our existing race fix correctly handles.

## Scope

File: `frontend/src/app/services/sfu-client.service.ts`

In `doPublish` (around line 767):
```ts
const audioTransceiver = audioTrack
  ? this.pc.addTransceiver(audioTrack, { direction: 'sendonly' })   // was 'sendrecv'
  : this.pc.addTransceiver('audio', { direction: 'sendonly' });     // was 'sendrecv'
this.audioSender = audioTransceiver.sender;

const videoTrack = localStream?.getVideoTracks()[0];
const videoTransceiver = videoTrack
  ? this.pc.addTransceiver(videoTrack, { direction: 'sendonly', sendEncodings: VIDEO_SIMULCAST_ENCODINGS })   // was 'sendrecv'
  : this.pc.addTransceiver('video', { direction: 'sendonly', sendEncodings: VIDEO_SIMULCAST_ENCODINGS });     // was 'sendrecv'
this.videoSender = videoTransceiver.sender;
```

Also check `doPublishScreen` (the screen-share publish path, around line 449) for the same pattern and change `direction: 'sendrecv'` → `'sendonly'` there too if present.

## Why this is safe

- `audioSender.replaceTrack(...)` and `videoSender.replaceTrack(...)` (used for mic-mute/camera-flip) work identically on sendonly transceivers — the sender's contract is unchanged.
- The `direction: 'sendrecv'` setting was likely chosen for flexibility but isn't required for any current behavior — we publish FROM these transceivers exclusively; subscribed-FROM-remote tracks always go on different transceivers.
- The existing comment at line 774 (`// Camera off: pre-negotiate so replaceTrack works later without renegotiation; sendEncodings persists through replaceTrack`) is about publish-only behavior; the sendonly change does not affect `replaceTrack` semantics.
- After this change, every cross-peer subscribe triggers renegotiation (CF adds new recvonly transceivers). That's slightly more SDP churn but it's the architecturally-correct flow and matches what Cloudflare's own examples do.

## Hard constraints

- ONLY touch `frontend/src/app/services/sfu-client.service.ts`. No other files.
- Change ONLY the 4 (or 6 if screen-share has the same pattern) `direction:` strings. Do not touch any other logic.
- Do not remove the `sendEncodings: VIDEO_SIMULCAST_ENCODINGS` option — it must remain for simulcast on the video sender.
- The screen-share path uses `replaceTrack` on `videoSender`/`audioSender` for its own publish; double-check the screen-share path STILL works (just code review — actual screen-share test isn't required).

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 4/4 PASS. The connecting-window spec's watchdog stuck-warning should STILL be FALSE for both sides (the previous run had host:false, guest:false consistently).
4. Code review: confirm exactly the directions changed, nothing else.
5. Write `validation/fix-sendrecv.md`: files touched, the asymmetric bug timeline, why sendonly resolves it.
6. Commit: `fix(sfu): publish transceivers sendonly so cross-peer subscribes trigger ontrack`. One commit.

## Stop conditions

- 3× build failure → STOP, write blocker, do NOT push.
- If you find a code path that depends on the publish transceiver receiver direction (e.g., a track read from `audioTransceiver.receiver.track`), STOP and report.

Final line MUST be: `STATUS: DONE — sendrecv fix ready for validation`.
