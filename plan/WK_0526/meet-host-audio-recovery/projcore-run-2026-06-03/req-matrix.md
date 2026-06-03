# req-matrix.md — meet-host-audio-recovery

| Req | Batch | Acceptance (short) | Status | Evidence |
|-----|-------|--------------------|--------|----------|
| R1.1 | B1 | kickstart muted <audio> per remote source (#121673) ⇒ mixer audible | VERIFIED (e2e E2 kickstart) | unit+test |
| R1.2 | B1 | AudioContext auto-resume (any interaction) + no idle suspend; no banner-tap dependency | VERIFIED (e2e E3) | unit+test |
| R1.3 | B1 | host hears late joiner, no user action (emitted climbs) | VERIFIED-e2e (E4 auto-recover); real-RTP=LIVE | test+LIVE |
| R1.4 | B1 | no regression: volume/mute/limiter/mic-persist/camera/common playout | VERIFIED (e2e E5) | test+manual |
| R2.1 | B2 | watchdog samples bytes+emitted per remote track, all devices | VERIFIED | unit+test |
| R2.2 | B2 | detects receiving-but-silent (bytes up, emitted flat) | VERIFIED | unit |
| R2.3 | B2 | auto recovery ladder runs to restore emitted, logged, backs off | VERIFIED | unit+test |
| R2.4 | B2 | no regression / silent when healthy | VERIFIED | test+manual |

Live (JROM seat): real host-alone-then-late-join call, all parties hear each other.
