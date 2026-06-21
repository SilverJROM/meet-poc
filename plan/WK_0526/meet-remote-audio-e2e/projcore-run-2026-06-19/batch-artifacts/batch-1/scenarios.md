# Batch-1 Scenarios — Remote participant (creepy-mini) joins over long-haul TURN+SFU

**Batch:** batch-1  
**Req:** R2  
**Bar for PASS:** Host shows the ADMITTED remote participant tile (sidebar count increments). Remote reaches ICE connected/completed + has active outbound audio track (publishing). (Audio *content* measured flow is B2/B3, not required.)

## Preconditions
- DEV up and serving public URL https://voice.silverjrom.app
- Fresh throwaway room (never TEST_ROOM01)
- Host: automated logged-in client (jrom seed) creates + joins the room in-call (auto-admit ready)
- Remote: Peer2-codex on creepy-mini (Ubuntu, Chrome 149, Playwright cached, DISPLAY=:0, fake audio device only)

## Scenario 1: Guest knock path (no login)
1. Host creates throwaway room via API, constructs full public URL, joins as host (display name "host"), drives preflight if present, reaches `.call-panel` with 1 tile.
2. Host remains in-call, listening for knock.
3. Remote (via relay-driven script, using verbatim B0 rig path):
   - Opens the public room URL + ?sfu=0 .
   - Handles any #guest-display-name + Continue overlay.
   - Drives lobby preflight EXACT (400/1100/350/400 waits + Test speaker / Yes / Confirm buttons).
   - Fills display-name, clicks "Ask to join".
   - Sees knocking state ("Asking the host to admit you" or "The host is available").
   - (WS construct/open/send logged via monkey.)
4. Host observes knock-toast (or waiting list) for the remote name, clicks Admit (using the inspected selector).
5. Host observes: app-tile count → 2, participant sidebar admitted count increments, remote tile appears (name visible).

## Scenario 2: Remote reaches connected + publishing (ICE + SFU)
1. After admit (or concurrently while knocking), remote client:
   - Reaches sfuPublishState.status === 'published' (or equivalent local publish).
   - ICE connectionState / iceConnectionState reaches 'connected' or 'completed'.
   - Has at least one active outbound audio track (from getStats outbound-rtp audio).
2. Remote captures and reports:
   - After host admits (via toast/sidebar or debug.forceAdmit using myClientId), remote should reach publish + connected pair + RTT.
   - Both ends report selected candidate-pair type + RTT.

**Current execution status (post fix):** WS construct + knocking reproduced with verbatim path. Admit + remote ICE not observed (relay target mismatch persisted across retests; pm2 showed no guest activity for B1 rooms). Bar not met.

   - Full sfu diagnostics / getStats snapshot.
   - **SELECTED candidate-pair details (CRITICAL):** localCandidateType (relay/srflx/host), remoteCandidateType, currentRoundTripTime (RTT).
   - ALL gathered candidate types (from local-candidate / remote-candidate stats).
   - /api/ice-config response (confirm TURN servers + creds were fetched and present).
   - pc states (connection, iceConnection, iceGathering, signaling) if exposed.
   - Any console errors.
3. Host side also captures equivalent local view of the pair + publish for the remote peer.

## Failure path (EXPECTED possible on first try)
- On timeout or not-connected:
  - Capture on BOTH ends: iceGatheringState, ALL candidate types gathered (not just selected), whether any TURN candidate was present/selected, transport/SFU publish state, full console log, errors.
  - Remote reports exact sfuGetStats + iceConfig + pcStates.
  - Consult Peer2-codex via relay for its local view / logs / chrome state.
  - Root cause + minimal fix (if app bug) + retest loop.

## Pass criteria (observable)
- [ ] Host: remote tile visible + admitted (sidebar count +1, 2 tiles).
- [ ] Remote: sfu publish 'published' + iceConnectionState in {connected, completed} + active outbound audio track present.
- [ ] Metrics artifacts include explicit selected pair type + RTT on the remote (and preferably host).
- [ ] /api/ice-config on remote included TURN entries and they appear in candidate(s).
- Artifacts written under batch-artifacts/batch-1/ (screenshots, metrics/*.json, relay-transcript.md, changes.md with room id + root cause if any).

Room is throwaway and recorded for cleanup.
