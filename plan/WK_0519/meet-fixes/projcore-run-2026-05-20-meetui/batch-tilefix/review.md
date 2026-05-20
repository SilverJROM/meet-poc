# DR-30/DR-32 Review

PASS.

- DR-30 is scoped to local self-view only: the mirror class requires `peer.isLocal`, a visible camera video, no explicit display stream, and a non-`share-main` tile variant.
- Remote camera tiles are intentionally unmirrored.
- Screen-share content is unmirrored because share-main uses an explicit display stream and does not receive the self-view mirror class.
- DR-32 no longer mutates visible order from active speaker state; gallery and share-strip rendering use the stable peer list order.
- Active-speaker detection remains active and still feeds the existing tile highlight.
- Removed obsolete speaker-promotion code rather than leaving unused timers or debug fields.
- Reconnect/dedup paths were not changed.
