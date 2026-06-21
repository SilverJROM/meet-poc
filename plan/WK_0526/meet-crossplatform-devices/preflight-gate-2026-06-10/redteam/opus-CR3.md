# opus RED-TEAM CR3 (final pass)

## [CRITICAL] R9 host badge MISSES the admitted-but-never-published case (the Joanne scenario)
- computeRemoteAudioHealth loop (room.page.ts:2958) iterates `this.sfuClient.remotePublishers()` ONLY, and hardcodes isPublishing:true per entry. So a peer who is ADMITTED (in the roster / peers) but NEVER PUBLISHED (Joanne: hasPc=false -> not in remotePublishers) is NEVER evaluated -> never added to remoteAudioUnhealthyIds -> NO 'No audio' badge.
- This is the EXACT primary failure R9 exists to surface (host can't hear an admitted guest because she never published). The host stays blind to it. classifyPeerAudioHealth's `if (!isPublishing) return 'ok'` also encodes this blind spot.
- FIX: iterate over ADMITTED peers (the roster the host sees), not just remotePublishers. A peer that is admitted + past a short grace (~5-8s in-call) + NOT in remotePublishers (never published) + not known-muted -> unhealthy ('not-connected'). Keep the publishing-but-stalled check too. classifyPeerAudioHealth must treat admitted-not-publishing (after grace) as unhealthy, not 'ok'.

## [NON-CRITICAL/should-fix] R9 muted false-positive (cry-wolf)
- classifyPeerAudioHealth (room-decisions.ts:245) flags 'stalled' purely on bytesReceivedNow<=prev, with NO muted/enabled awareness. A legitimately MUTED publisher (track.enabled=false) whose inbound bytes stall -> false 'No audio' badge. The diagnostics already capture audioMuted/audioEnabled (567/569) but the classifier ignores them.
- FIX: pass the peer's muted/enabled state; a muted peer -> 'ok' (or a distinct 'muted', no alarm). Only an UNMUTED peer with no bytes is 'stalled'/unhealthy.

## CR-fix-1/2 regressions: none spotted. micWorking positive signal + speakerVerified correct; quiet-guest gating on isHost correct. R10 pure-fn tests look outcome-asserting.

## Grace period: ensure a freshly-joined peer (mid-publish, normal ~1-2s) is NOT badged immediately — the grace before flagging never-published is required to avoid a flicker on every join.

STATUS: CRITICAL-BUG — R9 host badge does not cover the admitted-but-never-published peer (iterates remotePublishers only) -> host blind to the Joanne scenario the indicator was built for. + muted false-positive (cry-wolf).
