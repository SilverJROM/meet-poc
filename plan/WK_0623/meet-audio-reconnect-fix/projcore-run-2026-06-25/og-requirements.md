# OG Requirements

## R1 Reproduce and Explain

Use recent diagnostics plus a local/DEV scenario to prove the no-audio mechanism. The explanation must distinguish browser playout failures, remote mic silence, and stale/incomplete SFU subscription state.

## R2 Clean Stale SFU Publisher State

On reconnect, resume, leave, and expiry, peers must not remain advertised to other clients unless they have a current usable SFU publisher session. Roster/presence changes must not leave clients in `advertised-not-subscribed` indefinitely.

## R3 Recover Stalled Inbound Audio

If an inbound audio track is attached but bytes/packets stop advancing while the peer is still advertised and not globally muted, trigger a bounded clean SFU resubscribe for that publisher rather than only trying remote audio playout recovery.

## R4 Preserve Mic-Silence Semantics

Keep local mic capture silence separate from remote subscription failure. Do not label a remote subscription problem as a microphone problem, and do not repeatedly resubscribe when the remote user's mic is intentionally muted.

## R5 Final Peer2 Proof

Run a host plus Peer2US machine validation on the target environment. Final evidence must show both sides hear each other, or if field audio cannot be completed, identify the external blocker precisely.

