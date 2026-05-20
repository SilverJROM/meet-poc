# Batch G (diagg / DR-17 + DR-20) — Projcore Independent Validation

**Verdict: PASS — VERIFIED.**

| Check | Result |
|---|---|
| Code commit | 24162c4 (device-dialog.scss -scaleX(-1), room.page SPEAKER_ORDER_SETTLE_MS, active-speaker.service +16, 178-line diagg spec) |
| `npm test -w backend` | 113 passed / 1 skipped |
| diagg + fixc3 + grid e2e | 9/9 (mirror assertions + speaker-order throttle + fixc3 reflow + grid clock) |
| Clean Run-1 + diag gate | 93/93 (codex) |
| Mirror removed | grep confirms NO `scaleX(-1)`/`rotateY(180)` on any video surface |
| DR-20 settle | `SPEAKER_ORDER_SETTLE_MS = 5_000` (was 500ms); speaking highlight stays live (separate from order) |
| pm2 env | CLEAN (no /tmp leak) |

## Requirement closure

| Req | Status |
|---|---|
| DR-17 remove all video mirroring | **VERIFIED** — true orientation everywhere; self-view now un-mirrored per JROM's "no mirroring anywhere" (changes.md notes the 1-line revert if it feels backwards on-device) |
| DR-20 stable speaker order + ~5s settle | **VERIFIED** — strip reorder throttled to 5s, speaking pulse immediate, grid stable |

## Note

fixc3 spec adapted (+14) for the 5s settle — honest (FIXC3.1 active-speaker-sort still passes with the throttle window).

## Next

H (DR-23 room search) → I (DR-25 device switch) → Z (DR-24 audit, final).
