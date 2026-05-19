# Batch B4 — Call UI + WebRTC client

**Persona switch:** Invoke `$lead`. You are NOT `$projcore`. Claude `/projcore` supervises.

**Batch ID:** B4
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/implementation-plan.md`
**Branch:** `feat/meet-rebuild-b4-call-ui` — off the B3 HEAD.

**Requirements assigned (verbatim from og-requirements.md):**
- **R4.2 (B4 slice)** — `/room/:id` route with lobby + call states
- **R4.3 (continued)** — visual conventions match lokalcamp
- **R4.6** — Room lobby state with knock/cancel
- **R4.7** — Room call state (tiles + mic/cam/screen/record buttons + owner waiting-room admit panel)
- **R4.8 (continued)** — stitched-panel absent (already closed by B3 S3.5; B4 must not regress this)
- **R5.1** — Full-mesh `RTCPeerConnection` to every admitted peer
- **R5.2** — `ICE_SERVERS` includes STUN (coturn URL added by B6 via env config)
- **R5.3** — Mute, camera toggle, screen-share work
- **R5.4** — Connection state per peer visible (tile presence acceptable; explicit indicator if simple)
- **R5.5** — Non-blocking warning at 6 peers
- **R9.3** — Two-context WebRTC tests with fake media flags

Read before coding:
- `og-requirements.md` (R4.2, R4.3, R4.6-R4.8, R5)
- `scenarios.md` (S4.1–S4.8)
- `project_specs.md` (§ 1 stack, § 6 UI, § 9 known gotchas — getUserMedia HTTPS, symmetric NAT note)
- `context-handoff.md` (post-B3 state + WS protocol surface tables)
- `legacy-poc/public/client.js` — **port the WebRTC client logic from here.** Read it carefully; key sections:
  - ICE_SERVERS + `RTCPeerConnection` creation
  - SDP offer/answer flow on `peer-joined` / `peer-left` / `signal` events
  - `getUserMedia` (mic + optional camera)
  - `getDisplayMedia` for screen share + replaceTrack on sender
  - Mute / camera-on-off toggles
  - **Skip:** MediaRecorder mixing logic — that's B5.

---

## Context (compressed)

B3 left a `room-placeholder` page at `/room/:id` that only calls `/api/rooms/:id/exists`. **Delete that placeholder and replace with the real room page.** The real page is ONE Angular component that conditionally renders **lobby state** or **call state** based on internal state (NOT separate routes — JROM's old PoC was structured this way and it worked; matching that minimizes URL churn).

Two-context test for P2P (S4.3, S4.4) needs Playwright's fake-media flags. `playwright.config.ts` already has them (`--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`). Verify they're effective; add if missing.

---

## Expected (acceptance criteria)

### Repo structure

```
frontend/src/app/
├── pages/
│   ├── (delete room-placeholder/)
│   └── room/
│       ├── room.page.ts             ← orchestrates lobby vs call state
│       ├── room.page.html
│       ├── room.page.scss
│       └── (sub-components below)
├── components/
│   ├── tile/                         ← per-peer video tile
│   ├── controls-bar/                 ← mic/cam/screen/record/leave buttons
│   ├── waiting-room-panel/           ← owner-only admit/reject list
│   └── knock-spinner/                ← guest knocking indicator
├── services/
│   ├── ws.service.ts                 ← WebSocket lifecycle (connect/disconnect/send/receive)
│   ├── webrtc.service.ts             ← RTCPeerConnection map + SDP handshake
│   └── media.service.ts              ← getUserMedia, getDisplayMedia, track lifecycle
└── app.routes.ts                     ← updated to load RoomPage at /room/:id (no auth guard — guests with link can join)
```

### Room page state machine (R4.2 + R4.6 + R4.7)

```
URL: /room/:id
Initial: 'checking'  → fetch /api/rooms/:id/exists
  exists=false       → state='not-found' (show error card + back-to-dashboard link)
  exists=true        → state='lobby'  (show lobby form)
On lobby submit:
  state='connecting' → open /ws, send join
  Receive 'admitted' → state='in-call' (mount call view)
  Receive 'knocking' → state='knocking' (show spinner + Cancel)
  Receive 'rejected' → state='rejected' (show reason; Back to dashboard)
  Receive 'error'    → state='error' (show error message)
On Cancel from 'knocking':
  state='lobby' (close WS, reset)
On Leave from 'in-call':
  state='left' (close WS, navigate to /dashboard if authed, else / )
```

**Lobby state (R4.6):**
- Show room title (from `/api/rooms/:id/exists`)
- Name input (required, autocomplete=name)
- "Start with camera on" checkbox
- Submit: "Ask to join" (for guests) OR "Join" (for owner, who auto-admits)
- Knock state sub-panel: spinner + "Asking the host to admit you…" + Cancel button

**Call state (R4.7):**
- Controls bar at top:
  - Room label
  - Mute toggle (active=blue, inactive=gray)
  - Camera toggle
  - Share screen toggle
  - **Record button: present but DISABLED with title="Recording lands in B5" until B5 wires it up.** Codex MUST NOT implement recording.
  - Leave button (red)
  - Recording indicator (hidden in B4 — wire it for B5 visibility but never trigger)
- Owner-only: waiting-room panel (top-right floating, mirrors legacy CSS), list of knockers with Admit/Reject buttons per row
- Tiles grid: one tile per admitted peer (including local "You"). Local tile is muted (no echo). Remote tiles play received MediaStream.
- Non-blocking warning banner at 6 peers (R5.5): yellow tinted banner under controls bar, dismissable.

### Services

**`WsService`:**
- `connect(roomId)`: opens WS to `/ws` (relative URL — proxied by serve.js); returns observable/signal of incoming messages
- `send(msg)`: JSON-stringify and send
- `close()`: graceful close
- Handle abrupt close (e.g. owner closes browser) → emit a `disconnected` signal

**`WebrtcService`:**
- `peers = signal<Map<clientId, PeerState>>(new Map())` where PeerState = `{pc: RTCPeerConnection, name, stream: MediaStream|null, connectionState: RTCPeerConnectionState}`
- `addPeer(clientId, name)`: create `RTCPeerConnection({iceServers})`, add local tracks, set `ontrack` handler to populate stream
- `removePeer(clientId)`: close PC, remove from map
- `handleSignal(from, data)`: feed SDP/ICE candidate into the PC for that peer
- `replaceVideoTrack(newTrack)`: for screen-share toggle on all PCs

**`MediaService`:**
- `getLocalStream({audio:true, video:cameraOn})` — returns `MediaStream`
- `toggleMic()`, `toggleCamera()`, `toggleScreen()` — manage tracks and `enabled` flags

### ICE servers config (R5.2)

In `frontend/src/environments/environment.ts` (or equivalent — pick one path and log if you choose differently):

```typescript
export const environment = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // coturn added by B6 via env config substitution
  ],
};
```

Document the B6 extension point in `changes.md` so coturn injection is unambiguous.

### Tests (Playwright `e2e/tests/b4-call-ui/`)

| Spec | Scenarios | Notes |
|------|-----------|-------|
| `lobby.spec.ts` | S4.1 (guest lobby shows title) | single-context |
| `owner-auto-admit.spec.ts` | S4.2 | single-context, authed |
| `two-context-p2p.spec.ts` | S4.3 | TWO contexts; expensive — keep it tight |
| `waiting-room.spec.ts` | S4.4 | TWO contexts; admit + reject flow |
| `controls.spec.ts` | S4.5 (mute/camera/screen) | single-context; assert on `localStream.getAudioTracks()[0].enabled` via `page.evaluate` |
| `leave.spec.ts` | S4.6 (leave → /dashboard) | single-context |
| `room-full.spec.ts` | S4.7 | mock WS via test backend OR seed 8 peers via 8 ephemeral ws clients (simpler: do the latter against the real backend) |
| `peer-warning.spec.ts` | S4.8 (6-peer warning) | mock 6 admitted state in component via test-only signal injection OR ephemeral ws clients |

For S4.5 screen-share, Playwright's fake-media flag doesn't simulate `getDisplayMedia` well — acceptable to mock that single call via `page.exposeFunction` or check that the click triggers the call attempt (catch the rejection if permission is missing). Document the trade-off in `changes.md`.

For S4.7 and S4.8, the cleanest path is real ephemeral `ws` clients opening connections against the running backend to seed the room state. Use the same `ws` client library you used in B2 backend tests, but in the e2e Playwright global setup or per-spec setup.

### Configuration

**`playwright.config.ts`** must include browser launch args:
```typescript
use: {
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
},
```

Verify these are already present from B3; add if missing.

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement recording (MediaRecorder, /upload, mixer) — B5.
- **DO NOT** install or configure coturn — B6.
- **DO NOT** modify backend (`backend/`) unless absolutely required and justified in `changes.md`. B4 is FE-only.
- **DO NOT** restart legacy `meet-poc` PM2 entry.
- **Do NOT** introduce a new persistence layer. No new tables.

## Required artifacts

`plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-4/`:

1. `changes.md` — full template + WebRTC client architecture summary + B6 extension point for coturn URL + screen-share testing trade-off note
2. `scenarios-implemented.md` — S4.1–S4.8
3. `test-report.md` — backend regression PASS + B3 regression PASS + B4 targeted Playwright PASS
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — at minimum: lobby (knocking state), call view with 1 peer, call view with 2 peers (from two-context test), owner with waiting-room panel populated
7. **Decisions:** `decisions/2026-05-19-b4-<slug>.md` for each non-trivial autonomous call (e.g., screen-share testing strategy, R5.4 connection-state visibility choice, mock-vs-real WS for room-full test)

## Completion protocol

```
STATUS: DONE — B4 call UI + WebRTC client; S4.1-S4.8 green; coturn extension point ready for B6
```

OR BLOCKED / NEEDS-INFO.

Append to `progress.md` AND `callbacks.md`:
```
[projcore callback] batch-4 DONE — room page (lobby + call) + WebRTC client + 8 scenarios green
```

## Confirmation-prompt protocol

Same as prior batches.

## Model + reasoning guidance

- B4 is the most algorithmically subtle batch — WebRTC SDP handshake order, ICE candidate trickling, full-mesh PC bookkeeping when peers join/leave mid-call. **Cost-aware tier is OK for scaffolding** but **escalate to higher-reasoning tier (Codex's strongest model)** if you hit:
  - SDP offer/answer race conditions in tests
  - "perfect negotiation" pattern decisions
  - peer-left cleanup edge cases (does a peer disconnect mid-SDP?)
- Two-context Playwright tests are flake-prone; use generous timeouts (5-10s) for ICE connection state to reach 'connected'. If a test flakes once in 5 runs, that's not strong enough evidence to ship — investigate root cause.
- Per JROM §2.10a, run only `tests/b4-call-ui/` targeted; do NOT run full e2e during iteration. Full e2e is final sanity check (Phase 2).

— /projcore (Claude, Opus, 2026-05-19)
