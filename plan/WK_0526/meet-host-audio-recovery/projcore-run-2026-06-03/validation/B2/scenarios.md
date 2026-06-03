# B2 Scenarios

## R2-S1 Detector: receiving but not emitted
- Given four watchdog samples for one remote audio track
- And `bytesReceived` climbs while `jitterBufferEmittedCount` stays flat
- When `decideVoiceRecovery` is evaluated
- Then it returns the next ladder action: `resume`, `kickstart`, `replay`, then `rebuild`

## R2-S2 Guard: real silence
- Given samples where `bytesReceived` does not climb
- When the detector is evaluated
- Then it returns `none`
- And no recovery ladder step runs

## R2-S3 Guard: mute-all
- Given samples with the receiving-but-flat signature
- And `mutedAll === true`
- When the detector is evaluated
- Then it returns `none`
- And the room watchdog clears peer state while mute-all is active

## R2-S4 Healthy reset
- Given emitted count climbs on the latest sample
- When the room watchdog observes the track
- Then that peer's sample window and attempts reset
- And no further ladder escalation occurs

## R2-S5 Attempt cap
- Given the receiving-but-flat signature remains after four attempts
- When the detector is evaluated again
- Then it returns `none`
- And the watchdog does not thrash indefinitely

## R2-S6 Runtime watchdog
- Given a participant is in-call as host or guest
- When the page is running
- Then the room-level watchdog polls existing SFU diagnostics inbound audio stats every 1.5s
- And no new SFU stats pipeline is introduced

## R2-S7 Recovery ladder
- Given a stuck peer requires remediation
- When the watchdog escalates
- Then the service applies one B1-owned step per confirmed window: resume context, ensure kickstart, replay mixer output, rebuild mixer source via remove/add
