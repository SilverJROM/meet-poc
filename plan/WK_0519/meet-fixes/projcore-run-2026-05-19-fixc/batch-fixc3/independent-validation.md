# FIXC3 — Independent Projcore Validation

**Verdict: PASS — VERIFIED. Cleared to dispatch FIXC4.**

## Independent test execution

| Gate | Command | Result |
|---|---|---|
| 1 | `git status --short` | clean |
| 2 | `git log --oneline -4` | 2894e40 on top of FIXC2 chain |
| 3 | `git branch --show-current` | `fix/meet-fixc3-share-reflow` |
| 4 | `git diff --stat fix/meet-fixc2-device-modal...HEAD` | 21 files, 758+/21- |
| 5 | `npm test -w backend` | **60/60** PASS in 11.71s (+1 vs prior = new `signaling-media-state` screenOn coverage) |
| 6 | `npm test -w e2e -- tests/v3-fixc3-share-reflow --config=playwright.live.config.ts --workers=1` | **2/2** PASS in 6.4s, global-teardown cleaned 2/2 rooms |
| 7 | `npm test -w e2e -- <Run 1 + FIXC3>` | **55/55** PASS in 1.8m (R8.1 → 13 consecutive batches) |
| 8 | Screenshots present | `share-strip.png` (63KB) + `share-collapsed.png` (45KB) — viewed + soft-light theme confirmed |

## Implementation spot-check

- **Backend signaling:** `screenOn?: boolean` added to media-state (optional, defaults to false for legacy clients). New `signaling-media-state` test asserts (1) `screenOn:true` propagates, (2) omitted field defaults to `false`.
- **Frontend:** `ws.service.ts` emits + parses `screenOn`; `webrtc.service.ts` tracks per-peer `screenOn`; `active-speaker.service.ts` exposes a derived sort comparator using the existing 8Hz `activeFrame` RMS signal.
- **Layout reflow:** `room.page.{ts,html,scss}` introduces `share-layout` mode class. Main share stage (left) + vertical strip (right) when any peer or local is sharing.
- **Tile component:** `compact` input prop for strip tiles; `pulse` class wired to active-speaker boolean.
- **Collapse toggle:** chevron button on the strip's edge; CSS grid template expands main stage on collapse.
- **Hysteresis:** active-speaker promotion requires leading RMS for ≥500 ms — prevents jitter between equally-loud speakers.

## Spec coverage (2 test functions covering 6 brief scenarios — codex consolidation)

Codex consolidated FIXC3.1/3/4/5/6 into a single workflow test (share → reflow → speaker promotion → pulse → collapse → uncollapse → stop → grid). FIXC3.2 is the 8-participant strip-scroll test. Coverage is complete.

## Screenshot review

- **`share-strip.png`:** 4-participant call, "Shared screen" tile fills main area, right strip shows 4 compact tiles. `guest-c` (active speaker) is at index 0 → speaker promotion works. Chevron `>` toggle visible.
- **`share-collapsed.png`:** Strip collapsed, main share expanded, chevron flipped to `<` on the right edge.

## Known caveat surfaced by codex

> "The current WebRTC stack still publishes one video sender per peer. Remote sharers therefore publish screen video in place of camera video; the local sharer can still show local camera in the strip because the local camera stream is retained separately."

Single-sender topology trade-off — remote peer's camera tile is replaced by screen-share when they share. Local sharer unaffected (separate stream held locally). Not a blocker for R-C-4 (spec was local UX). Dual-sender architecture is out of scope.

## Requirement closure

| Req | Status |
|---|---|
| R-C-4 — Screen-share layout reflow | **VERIFIED** (single-sender caveat noted) |

## Regression check (R8.1)

13 consecutive batches now pass Run 1 desktop regression (55/55 = 53 prior + 2 new FIXC3 tests).
