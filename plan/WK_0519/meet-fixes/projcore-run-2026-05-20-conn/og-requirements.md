# Connection-Reliability + Screen-Share Helper — Requirements

## Source (JROM verbatim, 2026-05-20, post-Run-C real-device testing)

> "i tested it and it kind of works with the test accounts, the video and voice as working but on my desktop web app access im getting failed on the other users and it does not have a live feed of their video. also i get this weird access allow BS when i try to share screen on the browser w/c i dont get on google meet or zoom what is that BS? can we fix that"

> Follow-up: "is there a way we can make sure the failed does not happen is this due to websocket disconnection? how does other services fix or make this not happen on their app to make the connection persistent (or more)"

## Confirmed context (from JROM Q&A)

- Browser/OS: **Chrome on macOS**
- Network when video failed: **same WiFi/LAN, different physical devices**
- Failure look: **"failed" text on some peers + some frozen videos**
- Screen-share prompt: **macOS Screen & System Audio Recording permission** (screenshot confirms Chrome toggle ON but dialog still demands "restart Chrome") — an OS gate, not removable in-app
- WebRTC config today: **STUN only, no TURN** (`frontend/src/environments/environment.ts`)
- Architecture: **full-mesh P2P** (each peer connects to every other peer)

## This run = THE 80/20 RELIABILITY FIX (JROM directive 2026-05-20: "top 1-2 fixes that affect ~80%")

JROM evaluated the options and chose to apply the high-leverage fixes now: **(1) TURN relay** [biggest lever, ~70-80% — managed provider, credentials from JROM] and **(2) ICE-restart auto-recovery** [~10-15%, pure code]. Plus the agreed screen-share helper + cheap diagnostics/WS-reconnect that aid verification. The code is built config-driven so TURN credentials drop in the moment JROM provisions them (no code wait).

| Req | Requirement | Verification |
|---|---|---|
| DR-1 | **Screen-share helper.** When `getDisplayMedia()` fails or is blocked (macOS Screen Recording not granted / Chrome not restarted), show a clean in-app panel guiding: enable Screen Recording for Chrome in System Settings, then fully quit & reopen Chrome (Cmd+Q). Replaces dumping the user into raw Chrome dialogs. Cannot remove the OS dialog itself. | Playwright: stub getDisplayMedia to reject with NotAllowedError, assert the helper panel renders with the guidance text + restart instruction. |
| DR-2 | **Per-peer WebRTC diagnostics.** For each peer connection, log + expose `connectionState`, `iceConnectionState`, `iceGatheringState`, signaling state, and the selected candidate type (relay/srflx/host) via getStats. Visible diagnostics panel listing each remote peer + live states. Confirms whether TURN relay is actually being used post-fix. | Playwright: assert the diagnostic panel lists peers with their state fields. Manual: JROM reads which state each peer is in + whether `relay` candidates are selected. |
| DR-3 | **WebSocket auto-reconnect hardening.** Verify the signaling WS reconnects on drop. If missing/weak: add exponential-backoff reconnect + re-sync (re-announce presence, re-request peer list). Log connect/disconnect/reconnect transitions. | Backend/Playwright: simulate WS close, assert client reconnects + re-syncs. |
| DR-4 | **ICE-restart auto-recovery.** Detect `iceConnectionState`/`connectionState` transition to `disconnected`/`failed` per peer; trigger `pc.restartIce()` + renegotiation (offer/answer over signaling) to self-heal without rejoining. Debounce + cap retries to avoid thrash. | Playwright: force an ice-state failure on a peer connection, assert restartIce() fires + a new negotiation round occurs. |
| DR-6 | **Minimal quick-join (default), device-test opt-in.** JROM verbatim 2026-05-20: "minimize the device test when joining, unless the user wants to configure it set it to the defaults of the user." Default pre-join = Meet/Zoom-style quick-join: small self-preview + name + cam/mic toggles + Join, using the user's default/last-used devices automatically. The full device-test panel (preview + mic VU + speaker test + dropdowns) is hidden behind a "Test / configure devices" expander (opt-in). Layout chosen by JROM via mockup = "Quick-join with self-preview". Batch B. | Playwright: pre-join shows self-preview + name + toggles + Join WITHOUT the full dropdowns/VU panel; clicking "Test / configure devices" expands the full FIXC2 panel; chosen device persists. |
| DR-7 | **Pre-join validation + clear error feedback.** JROM verbatim 2026-05-20: "an error show when trying to join without a name as people keep experiencing it when trying to join and unable to know what is happening, and a proper error if things are not setup before joining." (a) Empty/whitespace-only name → on Join attempt, show an inline, human-readable error ("Enter your name to join") + focus the name field; ideally also disable the Join button with a hint until a name is present (don't let the click silently no-op). (b) Pre-join setup problems — camera/mic permission denied, no devices found, ICE-config fetch failed, media acquisition error — surface a clear, specific message explaining what's wrong + how to fix it, instead of a silent failure or cryptic frozen state. Build on the existing lobby permission-denied copy; make sure EVERY blocking pre-join condition has a readable message. Batch B. | Playwright: click Join with empty name → assert inline error + Join blocked; stub getUserMedia denial → assert clear permission error; (where feasible) stub ICE-config fetch failure → assert a setup error rather than silent hang. |
| DR-5 | **TURN config plumbing (credential-driven).** Frontend fetches its ICE server list from a backend endpoint (e.g. `GET /api/ice-config`) instead of the hardcoded `environment.iceServers`. Backend returns STUN + TURN servers read from env/config. When TURN env vars are unset, returns STUN-only (current behavior, no regression). When set (JROM's provisioned managed-TURN credentials — Metered static creds OR Cloudflare minted creds), returns them so relay activates with ZERO further code change. | Backend test: endpoint returns STUN-only when env unset; returns TURN entries when env set. Frontend: peer connections use the fetched config. Manual: JROM pastes creds → relay candidates appear in diagnostics. |

## Scope (hard limits)

- **DO** DR-1 through DR-5.
- **DO NOT** hardcode any TURN credentials in the repo — they come from env/secrets only (DR-5). Repo stays STUN-only by default; credentials are injected at runtime.
- **DO NOT** stand up a self-hosted TURN server (JROM chose managed TURN — provider TBD: Metered or Cloudflare).
- **DO NOT** start an SFU / media-server rebuild (strategic decision, separate — noted as the long-term architecture answer but out of scope here).
- **DO NOT** touch the Run-C features (FIXC1-8 are VERIFIED + done).
- Surgical, connection-reliability-only theme. If codex judges DR-1..DR-5 too large for one clean batch, it may propose a 2-batch split in the PROPOSED handshake.

## TURN provider note

JROM is provisioning **managed TURN** (Metered static creds, or Cloudflare minted creds — final pick pending). DR-5 must support BOTH credential shapes:
- **Static long-term creds** (Metered): `{ urls, username, credential }` — straight into iceServers.
- **Minted short-lived creds** (Cloudflare): backend calls the provider API with a key to mint per-session creds, returns them via `/api/ice-config`. Build the plumbing so either path works via env config; default off (STUN-only) until creds present.

## Branch

`fix/meet-conn-diag` off `fix/meet-fixc8-transcriber-config` tip (carries all Run-C work forward).
