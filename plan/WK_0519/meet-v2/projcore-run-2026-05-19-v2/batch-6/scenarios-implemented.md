# v2-B6 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S6.1 one-peer grid is centered and capped | PASS | `grid-layout.spec.ts`; `screenshots/grid-1-peer-centered.png` |
| S6.1 two-peer grid is split into equal columns | PASS | `grid-layout.spec.ts`; `screenshots/grid-2-peer-split.png` |
| S6.1 3-4 peers use 2-column/2x2 layout | PASS | `grid-layout.spec.ts`; `screenshots/grid-3-peer-2x2.png` |
| S6.1 5-9 peers use 3-column/3x3 layout | PASS | `grid-layout.spec.ts`; `screenshots/grid-5-peer-3x3.png` |
| S6.2 host badge appears only on host tile | PASS | `overlays-clock.spec.ts`; `screenshots/host-badge.png` |
| S6.3 mic mute state broadcasts and renders on remote tile | PASS | backend `signaling-media-state.test.ts`; `overlays-clock.spec.ts`; `screenshots/mute-icon-visible.png` |
| S6.4 camera-off participant tile renders initials avatar | PASS | `overlays-clock.spec.ts`; `screenshots/camera-off-avatar.png` |
| S6.5 meeting elapsed clock starts at admission and advances | PASS | `overlays-clock.spec.ts`; `screenshots/clock-0-05.png` |
| S6.6 live JROM comparison screenshot taken on public URL | PASS | `screenshots/jrom-comparison-live-call.png` from `https://voice.silverjrom.app/room/<temp>` |

Notes:

- Raw WebSocket guests are used for the 3-peer and 5-peer grid threshold checks to avoid unnecessary browser contexts.
- Real two-browser contexts are used where media-state behavior matters.
