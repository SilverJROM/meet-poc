# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B5 handoff (post-B4 PASS — backend layer + app shell + tabs complete)

**HEAD:** `feat/meet-v2-b4-tabs-pagination` (`cf00ed0 docs: append v2 batch 4 callback`)
**Branch for B5:** `feat/meet-v2-b5-lobby-preview` — off the B4 HEAD.

**Post-B4 state:**
- Backend: 5 modules, 16 vitest / 42 tests green. Pagination + recordingsCount complete. No further BE changes expected B5-B8 (B5 is purely frontend lobby work).
- Frontend `/app/*` shell live with 4 real tabs (Rooms paginated, Ongoing 5s poll, Past paginated w/ duration, Recordings paginated). Transcripts + Settings stubs (Run 2).
- `/room/:id` page unchanged from rebuild — has lobby state (name + camera checkbox) and call state (controls bar + tiles grid). NO device preview, NO mic level meter, NO device selector. **B5 lands all of these in the lobby.**
- Existing `MediaService` (`frontend/src/app/services/media.service.ts`) — handles `getUserMedia` + `getDisplayMedia` + mic/cam/screen toggles. Mic acquire happens on Join click, not on lobby mount.
- Existing `room.page.ts` state machine: `checking → lobby → connecting → knocking → in-call → rejected/error/left`. Lobby is the target state for B5 changes.

**What B5 must produce — Pattern X (pre-grant on lobby mount):**

- **Extend `MediaService`**:
  - New method `preflight({audio:true, video:bool})` — calls `navigator.mediaDevices.getUserMedia(...)` and returns the stream. Handles permission states: granted → returns stream; denied → throws typed `MediaError` with code `'denied'`; no-devices → throws with code `'no-devices'`; other → throws with code `'unknown'`.
  - `enumerateDevices()` — wraps `navigator.mediaDevices.enumerateDevices()`, returns `{audioInputs, videoInputs}`.
  - `reacquire({audioDeviceId, videoDeviceId, video:bool})` — releases old stream, calls `getUserMedia` with the new deviceId constraint. Updates the active stream.
  - `getMicLevel(stream)` — sets up an `AnalyserNode` on the audio track. Returns an `Observable<number>` (or signal) emitting 0-1 RMS at 8 Hz (NOT 60 fps — explicit `setInterval(125)` per og-requirements R8.7 throttle precedent, applied here for consistency).
  - Cleanup: stop tracks + close AudioContext on `reset()`.

- **New components**:
  - `frontend/src/app/components/mic-meter/mic-meter.component.{ts,html,scss}` — visual mic level meter. Props: `level` (0-1 signal). Renders 8 vertical bars, each lights up based on threshold (bar N visible if level > N/8). Smooth via CSS transition.
  - `frontend/src/app/components/lobby-preview/lobby-preview.component.{ts,html,scss}` — composite. Props: `stream` (MediaStream | null), `audioInputs`, `videoInputs`, `selectedAudioId`, `selectedVideoId`. Outputs: `audioDeviceChange`, `videoDeviceChange`. Renders the video preview tile (camera-on or "Camera off" placeholder), the mic-meter, two device selector dropdowns.

- **Extend `room.page.ts` lobby state**:
  - On entering `lobby` state: call `MediaService.preflight({audio:true, video:cameraRequested()})`. On success: store the stream in a signal `localStream = signal<MediaStream|null>(null)`. On `denied` error → set `permissionError = signal<'denied'|'no-devices'|null>(null)` to surface the UI message (per R7.4 — full handling lands in B7, B5 just sets the signal).
  - Call `enumerateDevices()` after first stream acquisition (devices labels only populate after permission granted).
  - Render `<app-lobby-preview>` between the room title and the join form. Props bound to `localStream`, devices, selected IDs.
  - On device selector change: call `reacquire(...)` → update `localStream`.
  - On Join click: pass the pre-acquired stream forward via `MediaService` (don't re-call getUserMedia). The existing `state = connecting` → admitted flow consumes the stream as already-set.
  - `__meetDebug.localStream = stream` window hook (existing pattern in B4) updated to reflect the pre-acquired stream so S5.1 + S5.5 can verify.

- **Frontend tests** `e2e/tests/v2-b5-lobby/`:
  - `lobby-preflight.spec.ts` — S5.1: navigate to `/room/<id>` lobby, `__meetDebug.localStream.getAudioTracks().length > 0` within 2s (Playwright launches with fake media + auto-grant)
  - `lobby-mic-meter.spec.ts` — S5.2: observe meter for 2s, at least 1 bar has `.is-active` class (fake mic emits beep tone)
  - `lobby-device-selector.spec.ts` — S5.3: open mic selector dropdown, >= 1 option visible (the fake virtual device)
  - `lobby-permission-denied.spec.ts` — S5.4: launch chromium with `permissions: []` override (no auto-grant); lobby shows permission-denied error UI + Retry button
  - `lobby-stream-carries.spec.ts` — S5.5: click Join, state transitions to `in-call`. Verify `__meetDebug.localStream` track IDs in lobby === track IDs in call (same stream, not re-acquired).

**Standing flags:**
- Commit BEFORE STATUS: DONE
- §1.15 decisions/2026-05-19-v2-b5-<slug>.md for: test-mic playback (R5.4 — optional; codex may skip with logged reason), threshold for "active" mic bars (e.g. > 5% RMS), how `permission-denied` Retry actually retries (re-call preflight, or full page reload)
- §2.10 real DOM
- Hygiene: tests use seeded room (TEST_ROOM01 OK to reuse since R5.x is about lobby state, not room state)

**Decisions locked:**
- Pattern X — pre-grant on mount (not deferred to button)
- Mic level meter throttled at 8 Hz
- Camera defaults to OFF (existing behavior); checkbox controls request
- Device selector dropdowns are simple `<select>` for now (Ionic component is fine if it doesn't add too much)

**Live service:** PM2 NODE_ENV=production. Codex rebuilds + restarts `meet-poc-fe`.

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
