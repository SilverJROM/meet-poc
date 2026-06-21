# Implementation Plan — Remote multi-party measured audio

Atomic vertical slices (§1.4c), ordered by dependency. Each = a thin demonstrable slice with ~1–3 measurements. This is a TEST+FIX run: the "build" is the measurement rig; the bulk of work is the diagnose→red-team→fix→retest loop on the live cross-machine audio path. Failures within a batch drive the loop; the 5x-cycle checkpoint spans the whole run.

## Branch
`feat/remote-audio-e2e-20260619` off current `feat/crossplatform-devices-20260604` (harness + any fixes land here; DEV-only).

## Batches

- **B0 — DEV up + local 2-client rig + energy-pass criteria** (R1, foundation)
  Bring up PM2 (`meet-poc-be`+`meet-poc-fe`), migrate/seed, `/health` green, host opens a throwaway room. Stand up the repeatable harness: a Playwright host client + a 2nd LOCAL fake-audio client both join the room; implement the **measurement module** (WebAudio energy + `getStats` inbound-rtp, distinct per-party signal, ≥3s threshold, dual-signal agreement). PASS = local client measurably hears host AND host hears local client (proves the rig + the pass criteria before any remote complexity). Capture the room-id + the harness entry-point.

- **B1 — Remote join (Peer2-codex reaches connected+publishing)** (R2)
  Drive Peer2-codex (via relay) to open the DEV room link on `creepy-mini`, complete knock→admit, reach ICE connected/completed + outbound audio track. Host sees the remote tile. This is the long-haul TURN+SFU path — diagnose ICE/relay/SFU here. Consult Peer2-codex for local getStats/ICE/console on any failure.

- **B2 — Host → Remote audio measured** (R3)
  Host emits known signal; Peer2-codex measures inbound energy + inbound-rtp > threshold ≥3s.

- **B3 — Remote → Host audio measured** (R4)
  Peer2-codex emits known signal; host measures inbound energy + inbound-rtp > threshold ≥3s.

- **B4 — 3-way full-mesh audio** (R5)
  Add sonnet-driven local client; verify every (sender→receiver) ordered pair measurably delivers. Matrix artifact.

- **B5 — Reproducibility** (R6)
  ≥2 consecutive clean runs of the multi-party audio delivery, no manual nudging. Then teardown/cleanup the throwaway room.

- **B6 — (STRETCH) Video both ways** (R7)
  Only if voice is solid + budget remains. inbound-rtp video frames > 0 both ends.

## Dependency order
B0 → B1 → (B2, B3) → B4 → B5 → B6. B2/B3 can interleave once B1 holds. B4 depends on B1's join path generalizing to 3 parties.

## Notes
- Every batch validates on the rendered app (DOM/Playwright + screenshot/log artifact), never an API read as headline proof (§1.11 UI-PROOF).
- The diagnose→red-team→fix→retest loop lives INSIDE each batch's gate failures; the 5x-cycle checkpoint counts cycles across the run.
