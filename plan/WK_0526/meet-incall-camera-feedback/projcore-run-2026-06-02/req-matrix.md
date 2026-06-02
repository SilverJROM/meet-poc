# req-matrix.md — meet-incall-camera-feedback

| Req | Batch | Acceptance (short) | Status | Evidence |
|-----|-------|--------------------|--------|----------|
| RC.1 | B1 | MIC enables in-call from off/absent (acquire+publish, re-ask) | VERIFIED (mic toggle non-stiff; acquire path defensive+unit-proven, gated-by-design per JROM) | unit+manual |
| RC.2 | B1 | CAMERA enables in-call from off/absent incl. no-stream (acquire+publish) | VERIFIED (live-proven e2e S4) | unit+manual |
| RC.3 | B1 | never disabled/dead-end; re-attempts each click; browser-block ⇒ gentle hint, not lockout | VERIFIED | manual |
| RC.4 | B1 | no regression: off-with-stream enable, screen-share, device-select | VERIFIED | manual |
| RF.1 | B2 | EC/NS/AGC enforced (graceful, no capture break) | VERIFIED | unit+manual |
| RF.2 | B2 | software suppressor on output (limiter; no >1.0 amp) | VERIFIED | unit+manual |
| RF.3 | B2 | NO detection UI / auto-mute / banner (per JROM) | VERIFIED | review |
| RF.4 | B2 | no regression: playout/volume/mute-all/device-select | VERIFIED | unit+manual |

Live (JROM seat): RC three permission states; RF real two-device room.
B1 (camera) first, B2 (feedback) after B1 PASS.
