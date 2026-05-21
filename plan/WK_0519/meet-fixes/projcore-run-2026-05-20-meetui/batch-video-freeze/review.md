# DR-47 Review

Scope check:
- DR-47 only: detection, recovery handoff, diagnostics fields/labels, and focused tests.
- No new recovery loop was added. Media-dead uses `maybeScheduleIceRestart`, `restartIce`, and the existing PC recreate path with the same caps/backoff and `peer.reconnecting` guard.

Regression guard:
- Intentional video-off is excluded before detection: camera off, screen-share camera suppression via media-state, manual audio-only, receiver pause, and DR-52 cull.
- If DR-47 already detected media-dead, the label/recovery state is preserved even if DR-42 auto-poor pause engages afterward; pre-existing intentional pauses still remain excluded.
- Degraded video is not treated as frozen while frames advance.

Risks:
- Browser support for `freezeCount`/`totalFreezesDuration` varies, so `framesDecoded`/`framesReceived` deltas are the primary signal.
