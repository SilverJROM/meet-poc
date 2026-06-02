# B1 decision — playability-detection approach (APPROVED-PLAN 2026-06-01)

**Q1 — extract `evaluateRemoteAudioPlayability` as a pure decision fn?** YES.
The extraction IS the minimal surgical change R1.2/NS5 want — it makes the playability
decision unit-provable. Both `allSinksPlaying()` and the `allPlayable` return of
`unlockAndPlayRemoteSinks()` route through it.

**Decision rule (locked):** when `mixerEnabled && sourcesCount > 0`, playable requires
`contextState === 'running' && outputAttached && !outputPaused` (AND per-peer all unpaused).
A suspended/closed/none context with sources ⇒ NOT playable ⇒ `remoteAudioBlocked` banner
surfaces the one-tap recovery.

**Q2 — emitted-count e2e gate?** NOT a hard gate.
Headless Chrome likely runs autoplay-policy=no-user-gesture-required → the AudioContext may
auto-run and cannot reproduce the SUSPENDED state; fake-media may not increment emitted.
Attempt the `jitterBufferEmittedCount`-climb assertion as PRIMARY e2e proof and report
honestly. If it can't be asserted headless, fall back to a localhost debugSnapshot
before/after note per NS5 (live two-machine = JROM seat).

**HARD gates:**
- (a) unit spec proving the decision fn: suspended+sources ⇒ not-playable ⇒ banner.
- (b) e2e asserting POSITIVE (running+unpaused ⇒ banner hidden) AND the banner-surfaces negative path.

Source: projcore (supervised run). Lifecycle post-live, Deferral OFF.
