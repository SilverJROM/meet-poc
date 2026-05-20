# Meet-UI + Chat + Diagnostics-Logging Run

## Source (JROM verbatim, 2026-05-20)

> "1. can you copy how the google meet ui shows, the tabs on bottom and how the video icons show and share screen not 1 to 1 atleast 80-90% the look and feel. 2. my US counterpart is still not working, he can hear me but i cant hear him even though when on device check his mic is working or my video is not coming thru, but when i test with someone from qatar it was working fine. 3rd add a chat functionality on the window."

JROM answers (locked): UI = restyle existing controls + tiles + share (no new features); chat = ephemeral (cleared on call end); US bug = "log all the diagnostics on all calls and list them as a separate section so we can troubleshoot if this happens again"; order = Meet UI → chat → diagnostics-log/US-fix.

Reference screenshot: `tmp/google_meet.png`.

## IP/legal note (binding)

Build a Meet-**LIKE** layout using OUR OWN / standard open icons — match the arrangement + feel ~80-90%. Do NOT reproduce Google's proprietary icon artwork, logos, or branding assets. Video-call UI conventions (bottom control bar, rounded tiles with name/mute labels, presenter+strip share view, side panels) are common patterns and fine to implement; the specific proprietary art is not.

## Requirements

| # | Requirement | Verification |
|---|---|---|
| DR-26 | **Google-Meet-LIKE UI restyle (~80-90%, own icons, no new features).** Restyle the in-call screen to feel like Meet: (a) **Bottom center control bar** — dark rounded icon buttons: mic toggle (red when muted), camera toggle (red when off), present/share-screen, settings, diagnostics, leave (red, distinct); device-select chevrons next to mic/camera where applicable. (b) **Bottom corners** — left: meeting name/code + clock; right: info, chat, participants/people icons. (c) **Video tiles** — rounded corners, name label bottom-left, muted-mic indicator top-right, camera-off shows an avatar/initials on a colored/gradient background, active-speaker outline. (d) **Share-screen layout** — presenter content big in the main area + participant tiles in a strip (already DR-4/FIXC3; restyle to match Meet). Keep ALL existing functionality wired (mic/cam/share/leave/settings/diagnostics/force-relay/audio-only/sidebar). Soft-light theme OR Meet-like dark for the call surface — propose at handshake. NO new features (no reactions/raise-hand/captions). | Playwright + screenshots: control bar shows the restyled buttons with correct states (mute red, cam-off red); tiles show name+mute+camera-off-avatar+active outline; share layout matches; all existing controls still function. JROM visual confirm vs the Meet reference. |
| DR-27 | **Ephemeral in-call chat.** Real-time text chat over the existing WebSocket signaling, visible to all admitted participants. A chat icon (bottom-right, Meet-like) toggles a side panel showing messages (`sender: text`, timestamp). Text-only. Messages are EPHEMERAL — cleared when the call ends / not persisted to any store. Unread-count badge on the chat icon when the panel is closed. | Playwright: 2 peers; one sends a chat message → the other sees it in the panel; unread badge increments when panel closed; messages gone after call ends (not persisted). Backend relay test for the chat message type. |
| DR-28 | **Persistent per-call connection-diagnostics log (separate section).** JROM: "log all the diagnostics on all calls and list them as a separate section so we can troubleshoot." For EVERY call/session, capture per-peer connection diagnostics over time: candidate type selected (host/srflx/**relay**), connectionState/iceConnectionState/iceGatheringState/signalingState transitions, quality (loss/jitter/RTT/bitrate), relay-used flag, reconnect/grace events, errors. Store per session (backend, keyed by session/room) and expose a **separate viewable section** (e.g., a "Call diagnostics" / "Connection logs" page or a per-session diagnostics view) listing past calls + their per-peer logs, so JROM can troubleshoot recurring issues like the US failure. Downloadable is a plus. This is the troubleshooting tool that will reveal the US root cause on the next US call. | Backend: a call's diagnostics are persisted + retrievable per session. Playwright/UI: the diagnostics section lists a call's per-peer states + candidate types. Manual: after a US call, JROM reads the log to see whether relay was used / where it failed. |

## US bug (DR-8 continuation) — gated on DR-28 data

The US↔PH asymmetric failure (Qatar works) is network-specific — leading hypothesis: US peer's network blocks UDP, so relay-over-UDP/STUN fails and we need TURN-over-TLS on 443; or a one-way relay allocation failure. **The actual fix is deferred until DR-28's log from a real US call reveals the cause.** Likely follow-on fix: ensure the ICE config includes a TURN/TLS-443 entry + verify both-direction relay. (Code-side: review `ice-config` for a 443 TLS turns: entry; Cloudflare mint currently returns turns:5349 TCP — 443 may be needed for strict firewalls.)

## Scope

- DO DR-26, DR-27, DR-28 (in that order). US-fix follows DR-28 data.
- DR-26: restyle only — NO new features (no reactions/raise-hand/CC).
- Do NOT regress DR-1..25 (all live + verified) or the audio/reconnect/relay logic.
- Env-hygiene rule (incident 2026-05-20): never leak MEET_DB_PATH/MEET_RECORDINGS_DIR onto the live pm2 service.

## Branch

Continue on `fix/meet-conn-diag` (carries DR-1..25).
