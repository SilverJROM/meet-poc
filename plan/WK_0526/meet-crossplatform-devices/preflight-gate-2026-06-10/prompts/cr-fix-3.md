# CR-FIX-3 — R9 (visibility: host audio-health indicator + quiet guests) + R10 (failure-simulation matrix). You are SONNET. Verifier!=fixer.
## FIRST: printf '[projcore callback] CR-FIX-3 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <ABS>/callbacks.md ; plan -> WAIT APPROVED -> implement -> DONE.
## R9 — ERROR VISIBILITY (confirmed policy): 
1. HOST AUDIO-HEALTH INDICATOR (host-only): on the HOST's view, per remote participant, show a small 'no audio' / 'not connected' badge on their tile when that participant is admitted but their audio is NOT reaching the host (no inbound audio track OR inbound audio bytesReceived not climbing for >~Ns) OR their reported diagnostics show not-publishing. Reuse the host's existing per-peer inbound stats (syncPeers/remotePublishers + inbound audio). Host-only (gate on isHost/owner). This is so the HOST is aware a guest can't be heard (the Joanne case).
2. QUIET GUESTS in-call: for CONNECTION/PUBLISH/server failures (audio-failed, publish fail, hasPc), the GUEST (non-host) must NOT get technical error popups/dialogs in-call — handle quietly (silent retry/recover in background) + always log to DIAGNOSTICS. (Re-scope CR-fix-1's guest-facing audio-failed dialog: for a NON-HOST in-call, do NOT auto-open the device dialog on connection failure — silent retry + diagnostics + host badge instead.) 
3. KEEP guest-visible: the GREEN-ROOM pre-join device setup help (mic/speaker test, the gate, the config panel for their OWN device) — guests need it to fix their own devices. Only IN-CALL connection/server errors go quiet.
4. Everything still logged to diagnostics (publishTriggerCount/preflightGateStatus/roomState already there; add per-peer audio-health to the host's diagnostics if useful).
## R10 — FAILURE-SIMULATION TEST MATRIX: add tests (extend the telemetry-replay/pure-fn pattern; extract pure decision fns where room.page can't be unit-tested) that SIMULATE each failure and ASSERT the app handles it (recover or graceful-fail) + surfaces per R9, NEVER silently mishandled:
   (a) audio-not-reaching-server (published but outbound bytesSent stays 0) -> host badge + diagnostics, guest silent-retry, NOT 'ready'.
   (b) publish-fails / (c) hasPc=false trigger-never-fires -> audio-failed path (already), surfaced to host/diagnostics.
   (d) state-revert-mid-publish -> shouldSurfacePublishFailure true (already) -> handled.
   (e) mic-dies-mid-call (track ended) -> recovery attempted + host badge if unrecovered.
   (f) speaker-dead (not verified) -> gate blocks (green-room).
   (g) device-unplugged at gate -> config panel / re-acquire.
   (h) permission-revoked -> friendly green-room block.
   (i) empty-transceiver -> throws (already).
   Each row = a passing test proving handled-not-silent.
## Tests + tsc=0 + tsx specs + ng build green. changes.md. NO commit.
Reply PROPOSED: the host audio-health detection approach (which signal/stat, the host-only gating, the badge), the quiet-guest re-scoping points, and the R10 test list (which are pure-fn-testable vs need extraction). WAIT for APPROVED-PLAN.
