# sonnet CODE red-team CR12 (lens L12: test integrity)

## Fix-by-fix test coverage

| Fix | Test label / file:line | Verdict |
|-----|------------------------|---------|
| **R1** sink-before-play ordering | `RA-REG-1` remote-audio.service.spec.ts:295 — `assert.deepStrictEqual(calls, ['setSinkId:speaker-1', 'play'])` | MEANINGFUL — wrong order flips index 0/1, assertion fails |
| **R2** two-concurrent-audible | `CR-FIX-5 R2` remote-audio.service.spec.ts:324 — two elements both `isConnected && !removed`, then B still playing after A removed | MEANINGFUL — single-track fallback would leave 1 element connected, count assertion fails |
| **B12** late-joiner sticky-unlock | `RA-REG-4` remote-audio.service.spec.ts:408 — late `addPublisher` after `unlockAndPlayRemoteSinks` asserts `play` in calls and `unlocked===true` | MEANINGFUL — no sticky unlock → play not called for late joiner |
| **B8/voiceStalled** banner-latches-on-stall + clears-on-emission | `CR-FIX-1` remote-audio.service.spec.ts:508 — asserts `remoteAudioBlocked()===true` after watchdog replay on unpaused element, then `false` after `noteVoiceEmissionAdvanced` | MEANINGFUL — without the latch, blocked() returns false for unpaused element; first `strictEqual(true)` fails |
| **B13** no-autoplay | `RA-REG-1` remote-audio.service.spec.ts:302 — `!elements[0].attributes.has('autoplay=')` | MEANINGFUL — any autoplay setAttribute call is caught by FakeAudioElement |
| **B14** reset clears registry+unlocked | `RA-REG-3` remote-audio.service.spec.ts:373 — verifies `unlocked===false`, `selectedAudioOutputId===null`, `effectiveSinkId===null`, `usedFallback===false`, all elements paused+removed | MEANINGFUL — each field individually asserted against post-reset state |
| **CR-fix-2** latch non-sticky (clears on bytes-flat / no-energy / mutedAll) | `CR-FIX-2` remote-audio-watchdog.spec.ts:63 — bytes climbing but energy=0 → `sampleWindowHasVoiceEnergy===false` → `decideVoiceRecovery==='none'`; `R2-U4` mutedAll→none; `R2-U3` bytes-flat→none | MEANINGFUL — without energy check, bytes-climbing-with-zero-energy path would return `'resume'` |
| **CR-fix-3** sink fallback honest | `CR-FIX-3` remote-audio.service.spec.ts:419 — stale speaker fails, asserts `result==='default-fallback'`, `usedFallback===true`, `effectiveSinkId===''`; recovery asserts `result==='selected'`, `usedFallback===false` | MEANINGFUL — without fix both paths report `'selected'`; first assertion fails |
| **CR-fix-4** ended-track guard | `CR-FIX-4` remote-audio.service.spec.ts:552 — syncPeers with ended stream removes element, `registryPeerIds===[]` | MEANINGFUL — without guard, ended-track peer stays registered |
| **CR-fix-4** negative-stat reject | `CR-FIX-4` remote-audio-watchdog.spec.ts:76 — negative bytes/energy → `decideVoiceRecovery==='none'` + `sampleWindowHasVoiceEnergy===false` | MEANINGFUL — without reject, negative bytes satisfy the bytes-climbing condition → `'resume'` |
| **CR-fix-4** unsupported-sink | `CR-FIX-4` remote-audio.service.spec.ts:476 — browser without setSinkId gets `'unsupported'` not `'selected'`; `remoteAudioBlocked()===false` | MEANINGFUL — without fix, missing setSinkId throws or marks blocked; both assertions fail |
| **CR-fix-5** mid-conflict no-permanent-stop + forced renegotiation | sfu-client.spec.ts:1581 — asserts `subscribeRetryAttempts.has('bob')===false`, `liveMidConflictRetryTimers.size===1`; after retry: `midToEntry.get('2').publisherClientId==='bob'`, `subscribedClientIds.has('bob')===true`, conflict retry counter cleared | MEANINGFUL — without fix: retry counter bumped (not conflict path) and no renegotiation forced; timer-size=0 fails |
| **CR-fix-5 R1/R2** per-publisher playout diagnostics | remote-audio.service.spec.ts:306 (R1) + 324 (R2) — `row.blockedReason===null`, `row.sinkId==='speaker-selected'`, both elements simultaneously `isConnected` | MEANINGFUL — wrong diagnostics or single-element path fails count/field assertions |
| **CR-fix-6** blocked/blockedReason agree | `CR-FIX-6` remote-audio.service.spec.ts:449 — failed+default both rejected → `remoteAudioBlocked()===true`, `blockedReason==='sink-failed'`; recovery → both clear | MEANINGFUL — without the agreement fix, blocked()==true but blockedReason===null or vice versa |
| **CR-fix-6** stale post-reset apply | remote-audio.service.spec.ts:581 — delayed setSinkId resolves after reset; asserts `perPublisher===[]`, `selectedAudioOutputId===null`, `remoteAudioBlocked()===false` | MEANINGFUL — stale write would repopulate registry; perPublisher.length===1 fails |
| **CR-fix-8** clientKey stripped on write | `G-1` backend test:584 — raw DB `payload_json` parsed and asserted `not.toHaveProperty('clientKey')`, while `participant_client_key` column correctly holds the key | MEANINGFUL — without write-time strip, payload_json contains the key and assertion fails |
| **CR-fix-9** clientKey redacted on read (legacy rows) | `CR-FIX-9` backend test:234 — inserts row with `clientKey` directly in payload_json; API detail + download both assert `not.toHaveProperty('clientKey')` | MEANINGFUL — without read-time redaction, legacy key is exposed; assertion fails |

## Any fix that could be reverted with tests still green?

None found. Each test asserts the outcome state produced by the fix, at the level where the bug would manifest (call order, boolean flags, return values, map sizes, DB contents). No test merely confirms the code ran without checking what it produced.

## Determinism

- `waitFor` (`remote-audio.service.spec.ts:140`) uses `Date.now()` as a 1-second deadline guard, but the predicates resolve via `Promise.resolve` microtask chains — not wall-clock dependent. Acceptable for Node.js unit tests; not a source of flakiness.
- `diagnostics.page.spec.ts:80`: `sampledAt: Date.now()` appears in a fixture but is never asserted on. Not a flakiness risk.
- `sfu-client.spec.ts`: all timer-dependent tests use `withFakeTimers`/`withFakeTimersAsync` which replace `setTimeout/clearTimeout` with a synchronous fake. Fully deterministic.
- Backend tests using `vi.useFakeTimers()` are properly scoped with `afterEach(vi.useRealTimers)`.
- No `Math.random()` in any test.

## NEW bugs / test gaps

None.

---

STATUS: CLEAN — tests are meaningful + cover the fixes
