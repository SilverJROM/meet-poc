## Topic: Host (JROM) cannot hear remote audio even though inbound RTP is arriving cleanly

## North-star (scoped from master):
On a real cross-platform / international call, the host must HEAR audible audio from every
remote participant who is sending audio. Today (session 11ee886f) the host received clean
inbound audio RTP from BOTH of the friend's devices (Windows mini-PC + Android phone, 0
packet loss) yet heard NEITHER. Outbound (host→remote) works — both his devices hear & see
him. Friend cameras were off, so "can't see him" is expected and NOT in scope. This is a
recurrence after FIX1–FIX5 (subscribe-retry / relay re-fetch / double-subscribe / recording)
did not close it — so the root cause is most likely NOT in those already-patched paths.

## Goal of this deliberation:
Identify the TRUE root cause(s) of inaudible remote audio on the host, with evidence at
file:line, and converge on the fix approach. Two named anomalies to resolve:
(A) PLAYOUT: inbound audio packets arrive (bytesReceived climbing, 0 loss) but are never
    rendered audibly. Localize to subscribe → ontrack → PeerState.stream → syncPeers →
    Web-Audio mixer → AudioContext state → single output <audio> element → sinkId.
(B) ONE-PUBLISHER-AT-A-TIME: the host held only ONE inbound audio track at a time
    (peer2, then it switched to phone — never both). Why is the second publisher displacing
    the first instead of being added concurrently?
Also propose the R3 diagnostics needed to PROVE decode-vs-sink next call (inbound audioLevel,
totalAudioEnergy, concealedSamples + host playout state per publisher).

## In scope:
- Remote-audio playout (Web Audio mixer, AudioContext lifecycle, autoplay-gesture gating, single output element, sinkId).
- SFU subscribe / ontrack / transceiver / mid-reconcile / roster → how remote audio tracks become `peers()[].stream` fed to syncPeers.
- Why only one concurrent inbound audio track.
- Diagnostics getStats extraction (why inbound audioLevel/totalAudioEnergy are null).

## Out of scope:
- Remote video receive (cameras off — nothing to receive).
- Recording / transcripts / lobby self-test / device acquisition (unless proven to BE the live root cause).
- Outbound path (works today).

## Triggering requirement / batch: R1 + R2 + R3 (T1 deliberation)

## Source pointers (small — read these first, then follow refs as needed):
- frontend/src/app/services/remote-audio.service.ts — Web-Audio mixer playout. Key: syncPeers (L237), addSource/createMediaStreamSource→gain→limiter→destination (L464), bindOutputElement single-output (L538), ensureGraph/AudioContext (L507), unlockAndPlayRemoteSinks autoplay-gesture (L263), applySinkId (L652).
- frontend/src/app/pages/room/room.page.ts:632-635 — the effect calling attachOutputElement + syncPeers(this.peers()); :2667 gesture unlock; :2796 voice-watchdog recoverVoicePlayout.
- frontend/src/app/services/sfu-client.service.ts — SFU client: ontrack, addTransceiver, subscribe path (one-publisher anomaly + track routing live here).
- frontend/src/app/services/sfu-mid-reconcile.ts — SDP m-line / transceiver↔publisher reconciliation (prime suspect for track→peer mapping + publisher displacement).
- frontend/src/app/services/sfu-roster-utils.ts — roster → peers assembly.
- frontend/src/app/services/active-speaker.service.ts — active-speaker (interacts with which audio is surfaced).
- frontend/src/app/services/remote-audio-playability.ts + remote-audio-health.ts — playability verdict / banner.
- frontend/src/app/pages/diagnostics/diagnostics.page.ts:405-448 + the getStats sample builder (search "inboundTracks"/"totalAudioEnergy") — why inbound audioLevel/energy are null.
- EVIDENCE: ../../diagnostics-evidence-2026-06-08.md (full per-participant + host inbound timeline).
- PRIOR FIXES (do not re-litigate unless live): git log FIX1..FIX5 (commits fa89e1e..2917b8b region), plan/.../projcore-run-2026-06-04/findings.md.
