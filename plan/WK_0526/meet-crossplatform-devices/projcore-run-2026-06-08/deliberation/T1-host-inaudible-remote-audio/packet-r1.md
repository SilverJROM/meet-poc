# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 1
# (Your role = the model you are running as: opus | codex55 | gpt54 | spark | sonnet | haiku.
#  Whoever dispatched you told you your role; write the matching verdict file.)

## 1. Anchor — BINDING FRAME (read anchor.md in this same dir FIRST; do NOT renegotiate it)
Path: `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/anchor.md`

GOAL (verbatim): Identify the TRUE root cause(s) of inaudible remote audio on the HOST, evidence
at file:line, and converge on the fix approach. Two anomalies:
 (A) PLAYOUT — inbound audio RTP arrives (bytesReceived climbing, 0 loss) but is never rendered
     audibly. Localize across: subscribe -> ontrack -> PeerState.stream -> syncPeers -> Web-Audio
     mixer -> AudioContext state -> single output <audio> element -> sinkId.
 (B) ONE-PUBLISHER-AT-A-TIME — host held only ONE inbound audio track at a time (Windows mini-PC
     "peer2", then it SWITCHED to the Android phone — never both concurrently). Why is the 2nd
     publisher displacing the 1st instead of being mixed alongside it?
 Also: propose the R3 diagnostics to PROVE decode-vs-sink next call.

## 2. The evidence (full pack: ../diagnostics-evidence-2026-06-08.md — read it)
- 3 participants on a Cloudflare-Calls SFU: silverjrom (HOST, PH), peer2 (Win mini-PC + external USB mic, US), Phone Peer2 (Android, US).
- HOST OUTBOUND WORKS: both friend devices received host audio+video, 0 loss ("he can hear & see me").
- Friend cameras OFF (video bytesSent=0) -> host "can't see him" is EXPECTED, not a bug.
- HOST INBOUND AUDIO ARRIVES for BOTH publishers, 0 packets lost — yet host heard NEITHER, on neither device.
- Host inbound timeline: subscribed to peer2/Win (bytesRecv 0->194KB) until ~08:26:45, GAP, then phone (0->86KB). Never both at once.
- Inbound audioLevel / totalAudioEnergy are NULL in the capture -> cannot yet prove decode-vs-sink from data alone.
- This is a RECURRENCE after FIX1-FIX5 (subscribe-retry / relay re-fetch / double-subscribe / recorder). Root cause is most likely NOT in those already-patched paths — look wider, especially the PLAYOUT/MIXER path and the track->peer->syncPeers wiring.

## 3. Your task
Independently DEEP-AUDIT this against the goal. You are NOT reviewing a draft — HUNT. Find ALL holes:
the real root cause, contributing bugs, race conditions, lifecycle/ordering bugs, wrong assumptions,
missing scenarios, and any alternative root cause the evidence also fits. Read the actual code at the
source pointers in anchor.md and follow refs. Every claim needs evidence at file:line. Distinguish
"proven by code+evidence" from "hypothesis". Prefer the explanation that accounts for BOTH anomalies
(inaudible + one-at-a-time) if one exists, but say so if they are independent.

Specifically reason about:
- Does each remote publisher's inbound audio track actually reach `peers()[].stream` and survive into `syncPeers`? Where could it be dropped/overwritten so only one survives?
- AudioContext lifecycle: could it be `suspended` (autoplay) for the whole call on the host? Is `unlockAndPlayRemoteSinks` actually invoked by a real user gesture in this flow? What if the host joined without a qualifying gesture?
- The single shared output `<audio>` element + single mixer `destination`: failure modes (srcObject not bound, element paused, muted, sinkId set to a dead/disconnected device, mutedAll).
- The one-at-a-time anomaly: transceiver reuse / mid-reconcile / roster replacing the prior publisher's stream/track; does adding publisher 2 call removeSource(publisher1)?
- Why inbound audioLevel/totalAudioEnergy are null in getStats extraction — and exactly which fields to add for R3.

## 4. Output — write THIS file (replace <role> with your role):
`plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/<role>-verdict-r1.md`

Format:
```
# <role> verdict — T1 round 1
## Root-cause finding(s)
| # | claim | confidence (proven/likely/hypothesis) | evidence file:line | which anomaly (A/B/both) |
## Contributing bugs / races / alternative causes (each with file:line)
## Fix approach (mechanism-level, file:line — what to change and why it closes the goal)
## R3 diagnostics to add (exact fields + where captured)
## Holes you could NOT rule out (be honest)
STATUS: AGREE — <one line: the root cause + fix you'd commit to>   (use AGREE only if you're confident in a converged root cause)
   OR
STATUS: REVISE — <one-line top open question blocking convergence>
```
Keep it tight and evidence-dense. Do NOT write production code. Do NOT edit anything outside your verdict file.
