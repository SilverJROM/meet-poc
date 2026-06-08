# opus verdict — T1 round 7

## Q1 — completeness gaps
None blocking. Every requirement B1-B20 has a concrete file:line owner and the ordered addPublisher sequence (opus-verdict-r6.md Q2 / design v2.1) is unambiguous. The implementer brief should bundle: (FIX-A) registry in remote-audio.service.ts + B17 wiring at room.page.ts:635 + flip B11 at room.page.ts:222/191 + banner B8 at 650-659 + recovery rewire at 2876/2852; (FIX-A2) B13/B14/B18/B19/B20 robustness; (FIX-B) mid-guard sfu-client.service.ts:1753 + 2-pub test; (FIX-C) B16 diagnostics. No further DESIGN decision is required to start.

## Q2 — closers re-attack
- **B14-guard:** OK. JS is single-threaded; the only suspension in addPublisher is the awaited setSinkId → re-checking the `disposed`/not-in-call flag AFTER that await and before append/register fully closes the reset↔add race.
- **B17 wiring:** OK and handles the stream-identity-change-same-clientId case: addPublisher step 2 reuses the entry and updates `el.srcObject` only if changed (mirrors the current syncPeers `current.stream !== peer.stream` logic, remote-audio.service.ts:255). Mid-call track replace → same element, new stream, no second element.
- **B18 timeout:** OK. On setSinkId timeout we play() to the currently-set sink (worst case default) → AUDIBLE, not silent; B16 logs selected-vs-effective sink so a wrong-device case is visible. Never silent-no-banner.
- **B19 catch audit:** OK as specified (every play() site → catch → blocked). Implementer must literally verify each site; it's mechanical.
- **B20 sink-reject:** OK — existing applyMediaElementSinkWithDefaultFallback falls back to '' (default, audible); blocked set only if both fail.

## Q3 — in-scope silence sweep (JROM's Chrome, setSinkId-supported, default audible)
No remaining silent-no-banner path:
- decoded-but-routed-nowhere → IMPOSSIBLE (direct-stream element + explicit sink, no Web-Audio destination).
- autoplay-blocked / late-joiner / background-resume → element paused → B8 banner + sticky-unlock/interaction/visibility recovery.
- setSinkId hang/reject → B18/B20 → audible default or banner.
- unhandled play reject → B19 → banner.
Every in-scope failure either self-heals or shows the banner. The original "silent forever, no indication" class is closed.

## Q4
NO NEW ISSUE — design v2.1 complete and implementation-ready.
(Environmental paths — OS-exclusive device, background OS-throttle, undecodable publisher track, all-remote-muted — remain out of fix scope and are DETECTED by B16; not silent-no-banner in JROM's environment.)

STATUS: AGREE — v2.1 complete, implementation-ready, no in-scope silent-no-banner path. This is my vote toward the first clean round.
