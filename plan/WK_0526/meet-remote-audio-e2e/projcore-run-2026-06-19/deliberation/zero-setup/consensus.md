# CONSENSUS — R10 zero-setup join + app-defaults + thin agent (3 Claude panel, 2026-06-20)

Panel: opus + sonnet + haiku. UNANIMOUS, low-risk, converged.

## REFRAME (important)
The "audio bug" was NEVER an app media problem. The app is ALREADY SFU-only/unconditional. The two real issues were both HARNESS/GATE:
1. The agent script appended ?sfu=0 (disabling SFU in the agent's session) — a harness quirk no real user has.
2. The pre-join DEVICE GATE blocks join when there's no working speaker.
The app's actual call path is sound (B0 proved local audio).

## THE FIX (converged, ship in this order)

### Fix A — non-blocking pre-join device gate (THE CRUX, delivers R10)
- room.page.ts:270 `preflightConfirmReady = micWorking() && speakerVerified()` and room-decisions.ts:217 — make NON-BLOCKING. A user joins with ONLY the browser mic/cam permission; speakerVerified must NOT gate join.
- Auto-pick devices (sensible defaults). A speakerless user still joins; if no sound, the EXISTING in-call watchdogs (B2b silent-mic, remote-voice, remoteAudioBlocked recovery) surface a "No sound" warning ~5s after join — no loss of recoverability (sonnet: low risk).
- KEEP the speaker-test UI in the device dialog as an OPTIONAL tool; just stop GATING join on it (sonnet). KEEP in-call watchdogs/host-badge as the safety net (opus).
- This IS R10: open URL → grant mic/cam → in the call, everything works, zero setup.

### Fix B — strip vestigial ?sfu from the harness
- Remove ?sfu=0 from the agent script. DO NOT add ?sfu param handling to the APP (sonnet: app is already SFU-only; adding it = future attack surface for this exact bug).

### Fix C — thin user-faithful agent (falls out for free once gate is non-blocking)
- Agent loads the PLAIN room URL (agentroom), real join UI, just grants fake mic/cam, measures via sfuGetStats() inbound-rtp + remoteAudio playback health. Small inline snippet sent per-run via relay.sh — NO fat 864-line deployed script (kills deploy-drift).

## Quality gates before/after implement (haiku)
- Confirm SFU code has no silent fallback branch that could disable it.
- Thin agent joins headless on creepy-mini WITHOUT a device test.
- Check device-dialog confirm-button dependency when relaxing the gate.
- Real-user acceptance: speakerless machine joins → "No sound" in-call warning (not blocked).

## Risk: LOW. Real-user impact is POSITIVE — a user with no working speaker now JOINS (with a warning) instead of being blocked. Exactly R10.

## Implementer: sonnet (affects real users → red-team carefully). Order: A → B → C.
