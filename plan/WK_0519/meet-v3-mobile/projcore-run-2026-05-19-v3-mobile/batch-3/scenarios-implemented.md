# M-B3 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S2.1 mobile participants open as 75dvh bottom sheet | PASS | `bottom-sheet-mobile.spec.ts`, `mobile-bottom-sheet-open.png` |
| S2.2 desktop participant sidebar remains a right-side rail | PASS | `controls-and-grid.spec.ts`, `desktop-sidebar-still-right.png` |
| S2.3 mobile controls are docked to the bottom safe-area | PASS | `controls-and-grid.spec.ts`, `mobile-controls-docked.png` |
| S2.4 desktop controls remain top mounted | PASS | `controls-and-grid.spec.ts`, `desktop-controls-top.png` |
| S2.5 one mobile peer uses the full call area | PASS | `controls-and-grid.spec.ts`, `mobile-grid-1peer.png` |
| S2.6 two mobile peers stack vertically | PASS | `controls-and-grid.spec.ts`, `mobile-grid-2peer.png` |
| S2.7 mobile screen-share button is absent from the DOM | PASS | `controls-and-grid.spec.ts`, `screen-share-hidden-mobile.png` |
| S2.8 desktop screen-share button remains visible | PASS | `controls-and-grid.spec.ts`, `screen-share-visible-desktop.png` |
| R2.5 mobile tile overlays remain usable | PASS | 3-4 peer compact-grid spec plus mobile screenshots |
| R2.6 iOS keyboard handling | PASS | Sidebar closes on input/select/textarea focus in mobile mode |
| R2.7 tap-to-switch sections | PASS | Bottom-sheet spec asserts `In the call` and `Waiting` tab state and content |
| R8.1 Run 1 desktop regression | PASS | 40/40 Playwright regression |

## Notes

The implementation keeps desktop markup and behavior on the existing Run 1 path. Mobile changes are gated by `ViewportService.isMobile()` and `bp.mobile` styles.
