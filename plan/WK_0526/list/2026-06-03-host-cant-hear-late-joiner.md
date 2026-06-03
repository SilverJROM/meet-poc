# 2026-06-03 — Host can't hear late joiner (recurring) + self-healing voice monitor

- **type:** bug (recurring root-cause) + feature (self-heal)
- **status:** FIXED + deployed (VERIFIED; real-world self-heal = JROM live seat)
- **agent:** projcore (autonomous, codex implementer)
- **run:** plan/WK_0526/meet-host-audio-recovery/projcore-run-2026-06-03 (OVM #19)
- **qa_verification:** projcore independent PASS — unit specs + ng build + b1-host-audio e2e 6/6 re-run on B1+B2 HEAD (incl. E4 alone-then-late-join auto-recovery). Merged master fc8733d, live bundle==HEAD.

## JROM verbatim
> "i cant hear the user again, can you check if she can hear me?"  (Joanne heard JROM; JROM emitted=0 from Joanne — host-playout fail recurring)
> "take inputs from the web ... please fix it this time, im being embarassed to my users"
> "all parties should have atleast a monitor if the voice is being played on each device and if its not then ... restart or adjust"

## Root cause (web-confirmed, the prior fix's gap)
Chromium #121673: a remote track via createMediaStreamSource is SILENT unless the same stream is ALSO attached to a muted playing <audio>. Our mixer nulled the per-tile audio when enabled → no kickstart → silent. Prior fix only handled the suspended-context half (banner-tap recovery, missed). Sources: w3c/webrtc-pc#2564, Babylon.js 7047, chromium 121673.

## Fix
- **B1:** muted kickstart <audio> per remote source (#121673) + automatic AudioContext resume (any interaction / visibility / keepalive / source-add), banner = fallback only. (commit adfebb9)
- **B2:** self-healing per-party voice-playout watchdog (decideVoiceRecovery) — every device samples bytes+emitted per remote track, detects receiving-but-silent, auto-runs recovery ladder (resume→kickstart→replay→rebuild) with mutedAll/bytes-flat/emitted-climbing guards + attempt-cap backoff. (commit bf5a1c4)

## Accountability
Prior run marked R1.1 VERIFIED after a call that happened to work, not exercising alone-then-late-join. This run's e2e E4 specifically proves that path. Real-RTP/real-device self-heal remains JROM's two-machine seat.
