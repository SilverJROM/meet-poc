# Independent Validation — Batch B2c (R10; AMENDS AC5)

**Validator:** independent / fresh-eyes (did NOT read plan, scenarios.md, or review.md).
**Repo:** /home/agjrom/websites/meet-poc — branch `feat/meet-diagnostics-audio-20260529` @ B2c commit `4a50da2` (single commit on top of `1ba17b5`).
**Method:** read R10 verbatim → read changes.md → read ACTUAL code (`mic-energy.ts`, `room.page.ts`, `room.page.html`, `media.service.ts`) + both specs → RE-RAN all three specs + build + the no-new-meter grep myself.

---

## Re-run proof (executed by me, not trusting the report)

```
$ npx tsx src/app/services/mic-sweep.spec.ts          -> mic-sweep: all assertions passed
$ npx tsx src/app/services/mic-capture-health.spec.ts -> mic-capture-health: all assertions passed
$ npx tsx src/app/services/mic-energy.spec.ts          -> mic-energy: all assertions passed
$ npm run build                                        -> BUILD_EXIT:0 (only 3 PRE-EXISTING warnings:
                                                          DatePipe NG8113, @stencil empty-glob, @mediapipe non-ESM)
$ git diff 1ba17b5..4a50da2 -- frontend/src | grep -E "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
                                                       -> EMPTY (no new meter primitives; energy stays getStats-based)
```

All green. The meter contract (NS5 — classifyMicCapture + getOutboundAudioSource only) is intact: no new AudioContext/AnalyserNode/createMediaStreamSource added in the diff.

---

## Claim-by-claim verdict

### Claim 1 — re-acquire CURRENT first, THEN try OTHER devices (the AC5 amendment) — PROVEN
`orderedMicCandidates` (mic-energy.ts:233-255) places the selected device FIRST (line 239-240) then every other in enumeration order. `decideMicRecovery` (mic-energy.ts:208-216) returns `try-device` for the FIRST unattempted candidate; since the list is current-first, step 1 = current, subsequent steps = each OTHER mic. `runMicSweep` (mic-energy.ts:316-365) loops, pushing each tried id into `attempted`, so `decideMicRecovery` advances candidate→candidate.
- Test `mic-capture-health.spec.ts:160-166` (U-2): current attempted, others remain ⇒ `try-device` deviceId `mic-B`, with an explicit `notStrictEqual(d.action,'keep-and-warn')` rejecting the OLD B2a same-device-then-terminate behavior. This is the load-bearing amendment proof.
- Test `mic-sweep.spec.ts:96-106` (U-4): first candidate silent ⇒ adopts the SECOND (`acquireCalls === ['mic-B','mic-C']`), proving a DIFFERENT device is actually tried + switched to.

### Claim 2 — adopts FIRST other mic with energy + NOTIFIES which device; NO "switched" notice on same-device re-acquire — PROVEN
`runMicSweep` returns `{outcome:'adopted', deviceId, label}` on the first `classifyCurrent()==='working'` (mic-energy.ts:361-362), stopping the loop (no later acquires). The adapter (room.page.ts:2349-2365) applies it: `syncSelectedAudioIdToTrack` persists, banner cleared, then the **`result.deviceId !== originalDeviceId` guard** (line 2353) gates the user notice — a DIFFERENT device sets `actionNotice = "Switched to <label> — your previous microphone had no sound"` (line 2355-2357); the same-device branch (line 2361-2365) clears the notice with NO "Switched to" copy.
- Tests: `mic-sweep.spec.ts:108-119` (U-5, first working ⇒ adopt, `acquireCalls === ['mic-B']`, no later acquire) and `:121-134` (U-12, adopted result carries string deviceId + non-empty label so the wiring can name the device).
- The `!== originalDeviceId` same-device suppression is wiring-only (not unit-tested in isolation) but is a 1-line guard, directly readable, and consistent with the U-12 contract.

### Claim 3 — error prompt ONLY when NO mic works, and original device restored — PROVEN
`decideMicRecovery` returns `keep-and-warn` only once every candidate is attempted (mic-energy.ts:213-215). `runMicSweep` handles `keep-and-warn` by restoring the ORIGINAL device when the live device drifted (mic-energy.ts:333-346) and returns `{outcome:'none-working', restoredDeviceId}`. The adapter then sets the terminal `micSilentWarningMessage` "No working microphone detected — check your mic/permissions" and `micSilentWarning.set(true)` (room.page.ts:2368-2375) — the SINGLE warn surface.
- Tests: `mic-sweep.spec.ts:140-151` (U-6, all silent ⇒ none-working + `restoredDeviceId === 'mic-A'`, and asserts `mic-A` was the LAST acquire = restored last) and `:197-211` (U-25, all throw/null ⇒ graceful none-working + restore).

### Claim 4 — NON-DESTRUCTIVE, never zero tracks; never-zero test is REAL not vacuous — PROVEN
The never-zero test (`mic-sweep.spec.ts:153-165`, U-7/U-22) is a genuine model: the harness `makeHooks` starts `live = 1` and tracks `minObserved`; on a successful acquire it swaps (count stays 1), on null/throw it KEEPS the old (count stays 1), recording `minObserved = Math.min(minObserved, live)` at every acquire AND on the throw path (mic-sweep.spec.ts:43-78). The test asserts `minObserved() >= 1` across the whole sweep AND `liveCount() >= 1` at exit. This COULD observe 0 if the wiring stopped the old track before adding the new — it does not, so the assertion is non-vacuous.
- The harness faithfully mirrors the REAL `media.replaceAudioTrack` (media.service.ts:88-109): getUserMedia first (throw ⇒ old untouched), `addTrack(next)` BEFORE `removeTrack(old)+stop()` (lines 100-105), and returns null WITHOUT removing the old when the next stream has no audio track (lines 96-99). Adds-before-removes confirmed.
- Sweep body issues NO destructive op: the `acquire` hook (room.page.ts:2331-2341) uses `media.replaceAudioTrack` ONLY. `removeAudioTrack()` (media.service.ts) is called ONLY from `recoverLocalAudioTrack` (room.page.ts:2263), which is reached ONLY from the pre-existing track-ended handler at room.page.ts:2229 (kind==='audio' loss path) — NOT the sweep. The `RecoveryAction` union (`try-device | keep-and-warn | none`) and `SweepResult` union (`adopted | none-working | aborted`) contain NO zero-track value (mic-energy.ts:185, 299-302).

### Claim 5 — BOUNDED, one sweep per episode, re-arm only after energy returns or on mute — PROVEN
`nextSweepGate` (mic-energy.ts:269-281): `shouldSweep` true on exactly the first silent poll (`!swept` ⇒ `{swept:true, shouldSweep:true}`), already-swept silent ⇒ `{swept:true, shouldSweep:false}` (no re-sweep). Re-arms on `'working'` (energy returned, line 275) and on `micActive=false` (mute, line 274). Wiring: `verifyInitialCaptureEnergy` sets `micSweepDoneForEpisode = true` then runs ONE sweep (room.page.ts:2298-2299); the watchdog drives `nextSweepGate`, stores `gate.swept`, and only sweeps on `gate.shouldSweep` (room.page.ts:2593-2605). Re-entrancy is locked by `micSweepInProgress` (set true at room.page.ts:2309, cleared in finally at 2389; watchdog early-returns on it at 2581; adapter early-returns at 2308). The watchdog re-arms `micSweepDoneForEpisode = false` on `!micActive` (room.page.ts:2575).
- Tests: `mic-sweep.spec.ts:233-271` (U-15 one-per-episode, U-16 working→silent re-arm, U-17 indeterminate unchanged, U-18 muted disarmed, U-19 mute-is-a-pause). Truth table is complete.

### Claim 6 — quiet-but-WORKING mic never swept (U-8 boundary not widened) — PROVEN
`decideMicRecovery` short-circuits to `none` for any classification != `'silent'` (mic-energy.ts:209). `verifyInitialCaptureEnergy` returns before the sweep when `classification !== 'silent'` (room.page.ts:2293). `classifyMicCapture` classifies a rising-energy window as `'working'` even with sub-threshold audioLevel (mic-energy.ts:121-122; U-8 at mic-capture-health.spec.ts:106-109 unchanged + GREEN). Sweep step also rejects working/indeterminate (mic-capture-health.spec.ts:178-181, U-8/U-9 ⇒ `none`). The discriminator was untouched by B2c, so the boundary is not widened.

### Claim 7 — muted/disabled never sweeps — PROVEN
`decideMicRecovery` returns `none` if `!micEnabled || !micUnmuted || !hasLiveAudioTrack` (mic-energy.ts:210), even when silent with candidates remaining (mic-capture-health.spec.ts:183-190, U-10). `nextSweepGate` disarms on `micActive=false` (mic-energy.ts:274; U-18). The watchdog gates the whole poll on `micActive` and re-arms+clears on `!micActive` (room.page.ts:2572-2578). Mid-sweep mute aborts: `runMicSweep` re-reads `gates()` each iteration and a false gate ⇒ `decideMicRecovery` returns `none` ⇒ `runMicSweep` returns `{outcome:'aborted'}` (mic-energy.ts:321-331; mic-sweep.spec.ts:213-227 muted-mid-sweep ⇒ aborted).

---

## Adversarial sanity-check (the four failure modes)

- **(a) zero audio tracks?** NO path. `replaceAudioTrack` adds-before-removes and keeps the old on null/throw (media.service.ts:96-105); the sweep never calls a stop/remove. `none-working` restore is also via `replaceAudioTrack` (non-destructive). Even the catch-all `try/catch` (room.page.ts:2381-2387) only flips the banner — never touches the track.
- **(b) loop/thrash?** NO. The `runMicSweep` loop is bounded by the finite `attempted` set growing toward the finite candidate list ⇒ `decideMicRecovery` reaches `keep-and-warn`. Episode-level thrash bounded by `nextSweepGate` (one sweep, re-arm only on working/mute) + `micSweepInProgress` re-entrancy lock. A null/throw candidate is pushed to `attempted` (mic-energy.ts:350) BEFORE the skip, so it can't be retried in the same sweep (no infinite skip loop).
- **(c) switch while muted?** NO. Pre-sweep gate (`decideMicRecovery` line 210 + `verifyInitialCaptureEnergy` + watchdog micActive gate) and per-iteration `gates()` re-read (abort on mute mid-sweep) both block it.
- **(d) sweep a quiet-but-working mic?** NO. Only `'silent'` is actionable; `'working'` (incl. rising-energy/quiet) ⇒ `none` and the watchdog/verify both bail before the sweep.

## Known non-gap (correctly excluded)
M-1/M-2/M-3 live multi-device ADOPTION end-to-end is not headless-testable (Chrome fake-media tones ALL inputs ⇒ every fake mic classifies 'working'); this is a MANUAL localhost:4700 USER-seat step, NOT a batch gap. The deterministic unit/wiring proof (U-1..U-25) fully covers the decision logic, candidate hygiene, gate bound, and never-zero wiring. I did NOT fabricate a fake-media result and did NOT penalize the batch for it.

---

## Conclusion
All 7 load-bearing claims PROVEN against the actual code + tests that I re-ran myself. The tests are non-trivial models of the contract (the never-zero invariant in particular could observe 0 and asserts otherwise). The AC5 lock is genuinely lifted (different-device switching now happens and is explicitly tested), the error prompt is gated to the no-mic-works terminal, recovery is non-destructive and bounded, and the quiet-but-working / muted boundaries are preserved. Build green, no new meter primitives.

STATUS: PASS
