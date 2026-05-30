---
date: 2026-05-30
project: meet-poc
type: north-star-amendment
source: projcore
priority: high
search_hooks: [mic-fallback, multi-device-recovery, AC5-amendment, R10]
---

# R10 / B2c — multi-device mic fallback (amends AC5)

**JROM (verbatim):** "ok, can we use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error"

**Amendment:** B2a's AC5 locked recovery to the SAME device only ("never switches to a different concrete device"). JROM lifts that: recovery now sweeps OTHER available mics and adopts the first that produces energy; only when none work does it prompt. Non-destructive + bounded (one sweep per silence episode) invariants preserved. New req R10, batch B2c, placed right after the in-flight B2b (not queue-end — core to the audio fix). B2b not interrupted.

**Counterfactual:** AC5-as-locked would warn the user after one same-device retry even when a second working mic is plugged in. JROM prefers auto-using it. Trade-off accepted: an auto device-switch mid-session, mitigated by a clear "switched to X" notice + only-on-confirmed-silence + one-sweep bound.
