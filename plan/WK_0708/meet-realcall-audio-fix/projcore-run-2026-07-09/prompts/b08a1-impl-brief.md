# Batch B08A-1 — AC15a sender-liveness stats reader (product code)

**Role:** implementer L3 (sonnet)  
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`  
**Repo:** `/home/agjrom/websites/meet-poc`  
**Branch:** `batch-01-diagnosis-2026-07-08` (do NOT merge to main)

## §4b (binding)
- impl_tier: **L3** (sonnet)
- validator_tier: **L3** (opus — never sonnet)
- deliberation: yes (your PROPOSED is the design gate)
- redteam: yes (standard) after DONE

## North-star / D28 anchors
- T1 discriminator path: capture vs sender. This batch is **reader only**.
- One bundled RTCPeerConnection (TURN not the cause).
- Stats corroborate; recording/transcript remain arbiter for live ACs. This batch closes **no AC**.
- Protected: never delete `652c1475` / `TEST_ROOM01`.

## Exact scope (D28 + D29)
**New product code — does not exist today.**

1. Add `getOutboundLiveness()` (name may match plan) over **ONE** `getStats()` pass returning:
   - Capture side (`media-source`): `totalAudioEnergy` + `totalSamplesDuration`
   - Sender side (`outbound-rtp` audio): `packetsSent` + `bytesSent`

2. **D29 binding — diagnostics payload (APP change, required):** emit the same four fields **per outbound audio track** in the app's diagnostics payload (`collectDiagnostics` / outbound track telemetry path). Real-call T1 is undiagnosable without this (07-08 only had `outboundAudioLevel` + `micSilent`).

Known gaps (plan-grounded):
- `extractOutboundAudioSource` (`mic-energy.ts`) returns NO `totalSamplesDuration`
- `totalSamplesDuration` today is on receive-side `media-playout` in sfu-client — do not confuse sides
- `hasOutboundAudioTrack()` is existence-only and ignores `bytesSent`

**D29 R1 note (do not hang anything off R1 here):** on sender-dead/capture-alive, `classifyMicCapture` early-returns `'working'` when capture energy advances — R1 never fires. This batch is reader+emit only.

**Out of scope for B08A-1:** classifier, injection, remedy, R1 changes, UI banners, recovery, dual-browser calls, AC verification.

## Acceptance (batch-local)
- Unit tests over synthetic `RTCStatsReport`s: all four counters extracted; non-number → null; never throws; **no second getStats()** pass.
- Diagnostics payload includes the four fields per outbound audio track (unit/fixture assertion).
- Closes no AC (AC15 closes only at B08A-3 after live transcript).
- Atomic commit(s) + `validation/b08a1-changes.md` (Codex-style).

## Handshake (mandatory)
First output: clear **PROPOSED**:
1. Mechanism diagnosis (where getStats is already called; where to hang the reader)
2. Files + why
3. Risks
4. Estimate minutes
5. Tier confirm L3
6. Self-hygiene note if relevant

Then **STOP** and wait for `APPROVED-PLAN`.

## Callbacks
Append to `$RUN_DIR/callbacks.md` and emit:
`[projcore callback] impl B08A-1 STATUS: PROPOSED | WORKING | DONE | BLOCKED — <note>`

On DONE: commit hash, test command + results, changes.md path.

## Atomicity
<30 min, ~1–3 tests, tight diff, 95/5. Execute ONLY this gap.
