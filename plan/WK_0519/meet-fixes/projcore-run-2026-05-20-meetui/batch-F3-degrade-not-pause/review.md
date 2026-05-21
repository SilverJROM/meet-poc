# Batch F3 Review

## Scope Review
- PASS: DR-56 policy routing is isolated to receiver auto-policy and sender parameter preference code.
- PASS: F2 negotiation path, ICE/TURN, identity/admit/reconnect, and audio paths were not changed.
- PASS: DR-51/52 mobile receiver culling still uses the mobile-specific path.
- PASS: DR-53 screen-share/camera suppression remains in `shouldPauseOutboundVideo()`.
- PASS: DR-13 audio priority remains `high`/`high`.

## Risk Notes
- `weak` now counts toward restore but not toward auto-degrade, preventing restored marginal links from immediately re-latching into degraded mode.
- True dead-link pause still requires the sustained poor threshold before acting.
