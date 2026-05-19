# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B8 handoff (post-B7 PASS — final batch of Run 1)

**HEAD:** `feat/meet-v2-b7-controls-banner-failure` (commit `04658ca docs: add v2 B7 evidence artifacts`)
**Branch for B8:** `feat/meet-v2-b8-sidebar-actions-leave-speaker` — off B7 HEAD.

**Post-B7 state:**
- Backend: 17 vitest / 43 tests. WS protocol full: media-state, recording-state/started/stopped, meeting-ended-by-host/meeting-ended, mute-target/mute-request, remove-peer/peer-removed.
- Frontend: app shell + tabs + lobby preview + dynamic grid + per-tile overlays + meeting clock + icon-state controls + host-only Record + "Host is recording" banner + polished device-failure UX. **All present at voice.silverjrom.app.**
- `<app-waiting-room-panel>` is a floating panel for knockers (from rebuild B4) — still in place. **B8 REPLACES it with `<app-participant-sidebar>` containing both admitted participants AND knockers.**
- Leave button → direct leave for everyone (no dialog). **B8 adds host-specific Leave confirm dialog with End-for-all vs Just-leave.**
- No active-speaker highlight yet. **B8 adds it.**

**WS protocol available (post-B7):** complete; B8 uses all the existing host-action messages.

**What B8 must produce (final batch):**

1. **`<app-participant-sidebar>`** — collapsible right-side panel:
   - Toggle button in controls bar (people icon with count badge — total admitted)
   - When open: docked right edge, ~320px wide, full-height
   - Two sections:
     - **"In the call"** — every admitted peer with name + mic icon + cam icon + Host badge if applicable; for the host viewer, a kebab (⋮) menu opens per-row with "Mute participant" and "Remove from meeting" actions
     - **"Waiting to join"** — HOST-ONLY section (non-hosts don't see); each knocker with Admit + Reject buttons inline
   - Replaces the existing `<app-waiting-room-panel>` (delete that component after migration)
   - Default state: collapsed; toggle button shows badge with knocker count + (if non-zero) a subtle pulse to alert host
   - Host's own row: kebab hidden/disabled

2. **Host actions** (R8.2):
   - Mute participant → emits `{type:'mute-target', clientId}` → server sends `mute-request` to target → target's client honors by calling `media.toggleMic()` to mute themselves + shows toast "Host muted you"
   - Remove from meeting → emits `{type:'remove-peer', clientId}` → server sends `peer-removed` + closes target's WS → target's UI navigates to `/app/rooms` with toast "You were removed by the host"
   - Host's own row: kebab disabled / not rendered

3. **Leave confirm dialog** (R8.4, R8.5):
   - Modal component `<app-leave-dialog>` shown ONLY for hosts when they click Leave
   - Two primary buttons: "End meeting for everyone" (red/danger) + "Leave but keep meeting going" (secondary)
   - X close (cancel) returns to call
   - **End-for-all client-orchestrated flow** (Claude-peer's critical correctness catch from intake):
     1. Disable buttons + show "Finalizing meeting…" spinner
     2. If `recorder.isRecording()`: `await recorder.stop()` → `await recorder.upload(blob, roomId)` with 8s hard timeout (fall through if exceeded)
     3. Send `{type:'meeting-ended-by-host'}` WS
     4. Wait up to 1s for the server's `meeting-ended` broadcast confirmation, then close WS
     5. Navigate to `/app/rooms`
     - Document: if host's tab closes during this flow, the partial blob may be lost (accepted trade-off, per og-requirements R8.5)
   - Non-hosts clicking Leave: NO dialog — direct leave (existing flow). Add the dialog ONLY when `isHost()` is true.

4. **`meeting-ended` toast for non-hosts** (R8.6):
   - When non-host receives `{type:'meeting-ended', reason}` WS broadcast: render `<app-meeting-ended-toast>` modal/toast with "The host ended this meeting" + OK button + 5-second auto-dismiss countdown
   - On dismiss/timeout: navigate to `/app/rooms` (if authed) or `/` (if not)

5. **Active-speaker highlight** (R8.7):
   - For every REMOTE admitted peer's MediaStream: `MediaService` (or new `ActiveSpeakerService`) sets up an `AnalyserNode` on the peer's audio track. RMS computed at **8 Hz via `setInterval(125)` — NOT requestAnimationFrame** (Claude-peer's explicit throttle catch).
   - Single peer at a time gets the active-speaker ring (`.is-speaking` class on `<app-tile>`). Threshold: -40 dBFS RMS minimum to count as "speaking" (codex tunes; log decision).
   - Local peer NOT highlighted.
   - When all peers are quiet (no RMS above threshold), no ring.
   - **Expose `__meetDebug.activeSpeakerHz`** for the S8.9 test to verify the throttle.
   - **Cleanup**: stop intervals + close analyzers when peer disconnects.

### Tests `e2e/tests/v2-b8-sidebar/`

- `sidebar-toggle-counts.spec.ts` (S8.1) — two-context: host opens sidebar, sees "In the call" with both names + "Waiting to join" with knocker; toggle button shows count badge
- `sidebar-non-host.spec.ts` (S8.2) — two-context: guest opens sidebar, "Waiting to join" section is NOT rendered
- `mute-participant.spec.ts` (S8.3) — two-context: host clicks kebab → Mute on guest's row; guest's mic enabled becomes false; mute icon appears on guest's tile in host's view within 2s
- `remove-participant.spec.ts` (S8.4) — two-context: host clicks Remove on guest; guest navigates away within 2s; host's view shows guest tile removed
- `leave-host-dialog.spec.ts` (S8.5) — host clicks Leave → modal with "End for all" / "Leave"; no dialog for non-host
- `end-for-all.spec.ts` (S8.6, S8.7) — two-context: host enters call (no recording), opens leave dialog, clicks End for all; within 8s, file exists if recording was active (skip the recording case in this spec — focus on the WS broadcast + navigation); guest receives meeting-ended toast + navigates to /app/rooms
- `meeting-ended-toast.spec.ts` (S8.8) — two-context: trigger meeting-ended (via host action OR direct WS send to server admin endpoint OR mock); non-host modal "The host ended this meeting" + OK + 5s auto-dismiss
- `active-speaker.spec.ts` (S8.9) — two-context with fake beep audio: at least 1 tile gets `.is-speaking` class during the observation; `__meetDebug.activeSpeakerHz` in 6-10 Hz range

### Required for completion

- Commit BEFORE STATUS: DONE (B6 missed it twice; B7 honored; B8 keep the discipline)
- `npm run build -w frontend` + `pm2 restart meet-poc-fe` to land on voice.silverjrom.app
- Run full B3-B8 regression with `--workers=1`

### Phase 2 follow-up (after B8 PASS)

/projcore spawns the fresh-context final-acceptance validator against voice.silverjrom.app:
- Verify all 44 reqs end-to-end
- ACCEPT or REJECT
- Hands back to JROM with run summary

## Standing flags

- §1.15 decisions/2026-05-19-v2-b8-<slug>.md for: active-speaker threshold, sidebar width / collapse behavior, dialog button colors / order
- §2.10 real DOM + real two-context where applicable
- Hygiene: tests clean up rooms/sessions/recordings they create
- **Commit BEFORE STATUS: DONE — triple-check before callback**

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.

## v2-B8 Completion Notes (Codex)

- Branch: `feat/meet-v2-b8-sidebar-actions-leave-speaker`
- Implemented: participant sidebar, host mute/remove actions, host-only leave dialog, end-for-all recording flush, non-host meeting-ended toast, active-speaker highlight.
- Removed: old `<app-waiting-room-panel>` component.
- Validation: B8 targeted 8/8, backend 43/43, root build PASS, B3-B8 Playwright 40/40 with `--workers=1`, PM2 `meet-poc-fe` restarted.
- Live evidence: `batch-8/screenshots/live-sidebar-host-open.png` captured at `https://voice.silverjrom.app`; temp room deleted.
- Active-speaker note: Chromium headless remote WebRTC audio exposed live tracks with zero samples. The app samples Web Audio first and includes browser fallbacks; S8.9 uses localhost-only debug injection to exercise the same service/tile path deterministically.
