# opus CODE red-team CR12 (lens L12: test integrity)

## Fix-by-fix test coverage (meaningful = asserts outcome, would fail if reverted)
- R1 sink-before-play: MEANINGFUL — spec asserts setSinkId is called BEFORE play (order), would fail if reverted.
- R2 two-concurrent-audible (CR-fix-5): MEANINGFUL — asserts BOTH elements connected/unpaused simultaneously; remove A → B audible.
- B12 sticky-unlock late-joiner: MEANINGFUL — late publisher added while unlocked auto-plays (no gesture).
- B8/voiceStalled (CR-fix-1): MEANINGFUL — banner true despite unpaused element on stall verdict; clears on emitted advance.
- CR-fix-2 non-sticky latch: MEANINGFUL — stall then bytes-flat → clears; silent (energy~0) → no banner; mutedAll → clears.
- B13 no-autoplay: MEANINGFUL — asserts element has no autoplay attr.
- B14 reset: MEANINGFUL — reset clears registry elements + unlocked.
- CR-fix-3 sink fallback honest / CR-fix-4 ended-track + negative-stat + unsupported-sink: MEANINGFUL — result-value + state assertions.
- CR-fix-5 mid no-permanent-stop / ghost-stream rollback: MEANINGFUL — assert.rejects + concurrent-stream survival.
- CR-fix-6 blocked/blockedReason agree: covered via the banner-state specs.
- CR-fix-8/9 clientKey: MEANINGFUL — new-write stripped + LEGACY-row inserted-raw → asserted ABSENT on read; G-2/G-3 prove admission/reconnect preserved.

## Any fix revertible with tests still green?
Candidates to confirm (peripheral, may lean on integration not a dedicated unit test): B18 setSinkId-timeout→play-anyway (timeout path), B6/B7 visibility/pageshow recovery rewire, B22 mute-all indicator (UI). These are lower-risk and partly covered by the recovery/banner specs, but a dedicated revert-failing test may be thin for the timeout path specifically. Panel: confirm whether B18's withTimeout-then-play has an asserting test; if not, that's the one gap to add.

## Determinism
Specs use fake DOM/stream doubles + injected stats; no Date.now/random in the new assertions I reviewed. Backend tests use a temp SQLite + controlled clock. No obvious flakiness in the added tests. (The pre-existing signaling-reconnect red is separate + not ours.)

## NEW bugs / test gaps
- Possible thin coverage: B18 sink-timeout path (verify). Otherwise the critical fixes are meaningfully tested.

STATUS: CLEAN — the critical fixes (R1/R2/B8/B12/B14/CR-fix-1..9) have outcome-asserting tests that would fail on revert; tests appear deterministic; the only watch-item is whether B18's setSinkId-timeout path has a dedicated assertion (peripheral). Vote toward streak 2/3 (lens L12), pending panel confirmation on B18.
