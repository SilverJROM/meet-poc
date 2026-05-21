# Batch F3 Scenarios

## User Report
On a marginal PH-to-US relay call, outbound video can be fully paused by the DR-42 audio-only floor and then never restores because the relay link sustains `weak`, not `good`.

## DR-56 Scenarios
- Marginal but connected relay link: when quality is `poor`, the audio-only floor is true, the peer connection is still connected, and expected inbound video has packets, the auto receiver policy chooses `degrade`, not `pause`.
- Truly dead link: when expected inbound video has zero packets for the sustained poor window, or the connection is failed/disconnected, the auto receiver policy chooses `pause`.
- Sustained weak restore: when a peer is auto-degraded and quality is sustained `weak` or `good` for the restore threshold, the auto receiver policy chooses `restore`.
- Sender preferences: video senders receive `degradationPreference`; camera uses `maintain-framerate`, screen share uses `contentHint='detail'` plus `maintain-resolution`. Audio priority remains `high`/`high`.
