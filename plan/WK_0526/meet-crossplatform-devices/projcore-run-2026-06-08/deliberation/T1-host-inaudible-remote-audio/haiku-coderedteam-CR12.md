# haiku CODE red-team CR12 (lens L12: test integrity)

## Fix-by-fix test coverage: each = meaningful-test / weak-or-missing

| Fix | Test | Evidence | Outcome |
|-----|------|----------|---------|
| R1: sink-before-play | RA-REG-1 `294–304` | `assert.deepStrictEqual(elements[0].calls, ['setSinkId:speaker-1', 'play'])` | ✓ Would fail if order reversed |
| R2: two-concurrent-audible | CR-FIX-5 R2 `324–350` | Two publishers both paused=false, blockedReason=null after removal | ✓ Would fail if either blocked |
| B12: late-joiner sticky-unlock | RA-REG-4 `407–417` | Late publisher auto-plays after `unlockAndPlayRemoteSinks` | ✓ Would fail if flag not sticky |
| B8/voiceStalled latch + clear | CR-FIX-1 `508–528` | `recoverVoicePlayout` → `remoteAudioBlocked()=true`, then `noteVoiceEmissionAdvanced` → false | ✓ Would fail if latch not non-sticky |
| B13: no-autoplay | RA-REG-1 `303` | `assert.ok(!elements[0].attributes.has('autoplay='))` | ✓ Would fail if attr added |
| B14: reset clears registry+unlocked | RA-REG-3/3b `373–405` | `unlocked=false`, all elements paused/removed | ✓ Would fail if not cleared |
| CR-fix-2: trackName separate | CR-FIX-2 `530–545` | `row.trackName='sfu-track-a'`, `row.trackId='browser-track-a'` | ✓ Would fail if conflated |
| CR-fix-3: fallback honest | CR-FIX-3 `419–447` | Failed sink → `'default-fallback'`, `usedFallback=true`, `effectiveSinkId=''` | ✓ Would fail if reported as 'selected' |
| CR-fix-4a: unsupported setSinkId | `247–257` | Non-sink browser → `'unsupported'` not `'selected'` | ✓ Would fail if claimed support |
| CR-fix-4b: unsupported no banner | `475–491` | No `setSinkId` method → plays default, no blocked banner | ✓ Would fail if banner raised |
| CR-fix-4c: ended-track guard | `547–550` | `currentAudioTrack(endedStream)=null` | ✓ Would fail if returned stale track |
| CR-fix-4d: ended-only removal | `552–567` | Sync peer with ended audio → element removed, registry empty | ✓ Would fail if registered stale track |
| CR-fix-4e: NotSupportedError guard | `569–579` | Play rejects NotSupportedError → no banner, output still playing | ✓ Would fail if treated as gesture-block |
| CR-fix-5: per-publisher energy | CR-FIX-5 R1 `306–322` | Inbound audio + selected sink → audible, blockedReason=null | ✓ Would fail if stalled |
| CR-fix-6: blocked/blockedReason agree | CR-FIX-6 `449–473` | Both sink fail → blocked=true, reason='sink-failed'; recover → both false/null | ✓ Would fail if state out-of-sync |
| CR-fix-8/9: clientKey redacted store | session-diag `234–294` | `payload.clientKey` NOT in response, DB row `participant_client_key` stored but redacted on read | ✓ Would fail if not redacted |

## Any fix with NO test, or test that would still pass if fix reverted?

None. Every fix has at least one meaningful test that would fail if reverted.

## NEW bugs / test gaps

None. All test assertions are outcome-focused (not attempt-checking). Deterministic: no flaky timers, no Date.now()-based assertions (only in test data payload). All tests exercise the OUTCOME of the fix, not just code path coverage.

---

STATUS: **CLEAN** — tests are meaningful, comprehensive, and outcome-focused. Each fix has a verifiable guard that would fail if the fix were reverted.
