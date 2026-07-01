# Batch B6 — Scenarios

## R6a — 2-person recovery (`sfu-b6a-two-person-recovery.spec.ts`)

| ID | Given | When | Then |
|----|-------|------|------|
| S1 | Host A + Guest B joined, both publishing, mutually subscribed (1 mid each way, healthy baseline) | Fault rule blocks A's subscribe-to-B calls (406); B's WS is dropped for test (`closeSignalingForTest`), forcing a real reconnect → new CF session → new advertised track | A's subscribed-track count drops to 0 for B (subscribe attempt hits the injected 406) |
| S2 | S1's injected failure is active | Poll `__meetDebug.sfuLastRecoveryEvent` on A | A non-null recovery event fires — the never-give-up ladder is actually engaging, not silently giving up |
| S3 | S1/S2 state (ladder engaged, still broken) | Fault rule cleared (no test-only recovery shortcut) | A's subscribed-track count returns to 1 **and** A's inbound audio bytes (`sfuGetStats` inbound-rtp/audio) advance past their pre-recovery baseline — proves they can hear each other again, not just "subscribed" |

## R6b — 5-person recovery + coalescing (`sfu-b6b-five-person-coalescing.spec.ts`)

| ID | Given | When | Then |
|----|-------|------|------|
| S4 | Host A + 4 guests joined, full mesh healthy baseline (4 subscribed mids each) | A blanket fault rule blocks ALL of A's subscribe-to-anyone calls (406, no track-name filter — new track names aren't known ahead of a reconnect) | rule installed via the new test-only route |
| S5 | S4's rule active | 3 of the 4 guests reconnect (`closeSignalingForTest`) within the same tick | A's subscribed-track count drops below 4 — 3 simultaneous advertised-but-unsubscribed publishers |
| S6 | S5's simultaneous failures | Poll `__meetDebug.sfuLastRecoveryEvent` on A for 13s (a window long enough for per-publisher rung-1/2 escalation, but shorter than the ladder's ≥15s full-rejoin throttle) | Exactly ONE distinct epoch recorded at rung `'sfu-rejoin'` (publisherClientId `'*'`) — 3 simultaneous triggers coalesce into ONE full rejoin, not a storm |
| S7 | S4's fault still active after S6 | Fault rule cleared | A's subscribed-track count returns to 4 (all peers) **and** A's inbound audio bytes advance — full recovery, not just the rejoin firing |

## Evidence (R6c)

- `screenshots/b6a-recovered.png`, `screenshots/b6b-recovered.png` — call panel after full recovery.
- `b6a-two-person-recovery.json`, `b6b-rejoin-epochs-during-fault.json`, `b6b-five-person-coalescing.json`
  — dumped `__meetDebug` snapshots (recovery events, epoch timeline, inbound-audio byte counts,
  post-recovery subscribed counts), not just a pass/fail string.
