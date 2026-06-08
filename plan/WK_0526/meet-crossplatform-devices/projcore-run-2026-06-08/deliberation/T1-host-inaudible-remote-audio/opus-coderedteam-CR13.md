# opus CODE red-team CR13 (lens L13: CRITICAL talk/record/see)

## TALK — HEAR others: CRITICAL-CLEAN
The fix delivers remote audio per-publisher: registry `<audio srcObject=stream>` + setSinkId-before-play (reliable on direct-stream → fixes the original A4) + sticky-unlock for late joiners + no-AudioContext (kills A3). No current path where a host receives a publisher's audio but can't hear it, and no path where a publisher's audio element is silently dropped (one element per publisherClientId, no active-speaker gating). voiceStalled latches the banner if emission stalls (no silent-no-banner). The original CRITICAL symptom is closed.

## TALK — BE HEARD: CRITICAL-CLEAN
Publish path is unchanged (the fix is on the receive/playout side). The mid-guard (CR-fix-5) on a live mid-conflict forces a RENEGOTIATION and explicitly does NOT permanent-stop → a still-advertised publisher is never stranded/suppressed (honors the no-suppress directive). So a speaking participant is always forwarded + subscribable → heard by others.

## RECORD — audio+video captured: CRITICAL-CLEAN
The recorder is INDEPENDENT (own AudioContext + own createMediaStreamSource per peer stream; recorder.service.ts) and sources BOTH local + remote streams DIRECTLY from peers()/remoteStreams() (room.page.ts:700,1318) — never from the removed mixer. `git diff` touched ZERO recorder lines. So recording still captures local + all remote audio + video. (Video is in the same MediaStreams the recorder receives.)

## SEE — video received: CRITICAL-CLEAN
The diff removed ONLY the tile remote-AUDIO element (tile.component.ts: the removed lines are all `remoteAudio*`/audio). The tile VIDEO is UNTOUCHED: `<video #video autoplay playsinline>` (tile.component.html:15) + the effect `video.srcObject = this.videoStream()` (tile.component.ts:47-50) remain. videoStream = displayStream ?? peer.stream → remote camera video still rendered. Screen-share video (remoteScreenStreams) unchanged. So every participant's camera/screen video is still received + displayed.

## Findings
- No [CRITICAL] finding: talk (hear + be-heard), record (audio+video), and see (video) are all intact end-to-end in the current code.
- [NON-CRITICAL] (already known/fixed, listed for completeness): the banner/observability + diagnostics-honesty + security-hardening items from CR8-CR12 are all closed; none affect talk/record/see.

STATUS: CRITICAL-CLEAN — no CRITICAL break of talk/record/see. The audio fix delivers hearing-others, be-heard is preserved (no-permanent-stop), recording is independent + intact, and video receive is untouched. Vote → streak 3/3, gate passes.
