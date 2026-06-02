# B1 Code Review — Host remote-audio playout: honest playability + AudioContext resume

**Reviewer:** [reviewer] v2.0 (Mode 1, Code Review)
**Branch:** `feat/host-audio-playout-mic-persist-20260601`
**Base:** `master @ d3591e4` · **Batch commit:** `2c0b2c5` (single commit on top)
**Verdict: APPROVE — STATUS: DONE.** qa to independently re-run unit + e2e.

---

## Diff Summary (`git diff d3591e4..HEAD --stat`)

| File | +/- | Nature |
|------|-----|--------|
| `frontend/src/app/services/remote-audio-playability.ts` | +50 (NEW) | Pure decision fn (plan A) |
| `frontend/src/app/services/remote-audio-playability.spec.ts` | +100 (NEW) | Unit spec U1-U10, `node:assert/strict` |
| `frontend/src/app/services/remote-audio.service.ts` | +124/-28 | Route both checks through fn; resume-in-stack; `sourcesVersion`+`outputPlaying` signals; localhost test hooks |
| `frontend/src/app/pages/room/room.page.ts` | +54/-? | Authoritative playability effect; debug `debugSnapshot()` + localhost `__suspendForTest`/`__injectRemoteSourceForTest`/`__removeRemoteSourceForTest` |
| `e2e/tests/b1-host-audio/host-audio.spec.ts` | +285 (NEW) | Two-context e2e E1-E6 |
| validation/B1/changes.md + screenshots/ | +103 | Evidence (not product) |

Scope is exactly the approved fix surface. No SFU/transport, capture/mic-energy, diagnostics, B2/B3, or layout files touched.

---

## Codex-Template Section Check (changes.md)

| Section | Present | Notes |
|---------|---------|-------|
| User Report (verbatim) | ✅ | Exact JROM quote, R1-only scoping called out |
| Root Cause (MECHANISM) | ✅ | BUG-1 (`element.paused`-only ignores `context.state`) + BUG-2 (`setTimeout(0)` non-gesture resume rejected). Names the specific functions/lifecycle. PASS Rule 8. |
| Code Changes (per-file WHAT+WHY) | ✅ | Per-file, with WHY tied to BUG-1/BUG-2/R1.3 |
| Verification (build + URL + smoke) | ✅ | FE build, e2e tsc, unit spec, e2e 6-pass + 12-pass repeat, DEV deploy smoke (BE/FE/tunnel 200) |
| Caveats (regression vs pre-existing) | ✅ | Stale v3-audiofix selectors (PRE-EXISTING); NS5 fake-media limitation (expected) |

All five sections present and substantive. PASS Rule 9.

---

## Scenario Coverage + Brief Anchoring

| Scenario | Brief anchor | Addressed by (file:line) | Honest? |
|----------|-------------|--------------------------|---------|
| U1 suspended+sources⇒false | NS2 / R1.2 / plan A rule | spec:21-26 → fn:43-44 | ✅ BUG-1 regression-proof |
| U2 running+sources⇒true | plan A | spec:28-34 | ✅ |
| U3 running+outputPaused⇒false | plan A | spec:36-42 | ✅ |
| U4 running+!attached⇒false | plan A | spec:44-50 | ✅ |
| U5 running+0 sources⇒true(fallback) | plan A | spec:52-58 → fn:47-49 | ✅ |
| U6 0 sources+per-peer paused⇒false | plan A | spec:60-66 | ✅ proves fallback returns exactly `perPeerAllUnpaused` |
| U7 closed+sources⇒false | plan A | spec:68-74 | ✅ |
| U8 'none'+sources⇒false | plan A | spec:76-82 | ✅ pre-graph value |
| U9 !mixer+sources⇒fallback true | plan A | spec:84-90 | ✅ |
| U10 !mixer+per-peer paused⇒false | plan A | spec:92-98 | ✅ |
| E1 positive banner-hidden | R1.1/R1.3 | spec:50-64 — real `debugSnapshot()` reads + `.audio-unblock-notice` count 0 | ✅ real DOM |
| E2 negative banner-surfaces | R1.2 / NS2 | spec:66-83 — `.audio-unblock-notice` visible + `contains('Tap to enable audio')` + `Enable audio` button | ✅ real DOM |
| E3 recovery clears banner | R1.3 / NS3 | spec:85-102 — real gesture click → poll running/unpaused → banner count 0 | ✅ |
| E4 source-add re-unlock | R1.3 / NS3 (BUG-2) | spec:104-126 — suspend→inject→banner→gesture→recover | ✅ |
| E5 no regression | R1.4 / NS4 | spec:128-168 — real mute-all + volume-slider controls (controls-bar.component.html:134/143/159) | ✅ |
| E6 SOFT getStats | NS1/NS5 | spec:170-212 — honest fake-media fallback to snapshot proxy, never gates | ✅ honest |

Every code change traces to a brief field; no out-of-scope changes. PASS Rule 10.

---

## Scrutiny findings (the high-risk areas)

### 1. Root cause mechanism-level AND implemented (not just described) — PASS
- **BUG-1 implemented:** `unlockAndPlayRemoteSinks` (service.ts:122-176) and `allSinksPlaying` (service.ts:184-194) both now drop the old `element.paused`-only `allPlayable` logic and return `evaluateRemoteAudioPlayability({... contextState: this.context?.state ?? 'none' ...})`. The diff literally deletes the `if (audio.paused) allPlayable = false` / `if (output.paused) allPlayable = false` lines and routes through the fn. The fn (playability.ts:43-44) makes non-`'running'` context with sources NOT playable. This is the mechanism, in code.
- **BUG-2 implemented:** `unlockAndPlayRemoteSinks` now kicks off `context.resume()` SYNCHRONOUSLY before the first `await` (service.ts:128-141), preserving the gesture's transient user-activation. The non-gesture `setTimeout(0)` caller (room.page.ts:564-567) still exists but now its resume rejects honestly and the new authoritative effect surfaces the banner instead of silently swallowing the failure. `sourcesVersion` bumps in `addSource`/`removeSource` (service.ts:261, 277) drive re-evaluation on source-add — the R1.3 branch the `setTimeout(0)` could never resume.

### 2. Scope discipline (NS6) — PASS, with one justified beyond-minimal addition
room.page.ts +54 lines, all tracing to the playability/resume/banner/test-hook surface:
- :524-527, :3166-3171, :3241-3245 — debug typing + `debugSnapshot()` method + localhost hooks (plan D).
- :545-552 — localhost-guarded `__suspendForTest`/`__injectRemoteSourceForTest`/`__removeRemoteSourceForTest` (plan D; guarded by the existing `if (isLocalhost)` block).
- :569-588 — the **new authoritative playability effect**.

**Judgment on the beyond-minimal `outputPlaying` signal + authoritative effect:** JUSTIFIED, not scope creep. The literal-minimal plan routes the verdict through the fn at gesture time only (line 2201). But the BUG-2 reality is that a source can arrive (or the context can suspend) with NO gesture in flight — there is no gesture-path write to flip the banner true. The effect (room.page.ts:577-587) is the reactive authority that closes exactly that gap, and it lives wholly within the approved room.page.ts unlock/effects/banner surface. The `outputPlaying` element-event signal (service.ts:35-58) is the mechanism-correct clear-trigger: gating the banner-clear on a real `playing`/`play` event rather than a transient `.paused` read avoids both a false-clear during the resume transition and a stuck-banner-after-recovery race. This is a mechanism-level robustness fix for the same bug class, within scope.

### 3. Test validity — PASS (CRITICAL smell-check cleared)
The e2e is NOT vacuous. It does NOT use `page.setContent`/static HTML and does NOT assert on the injected mock. It exercises genuine product code:
- `injectRemoteSource` (spec:237-249) builds a REAL oscillator→`MediaStreamDestination` stream and calls `__injectRemoteSourceForTest`, which routes to `RemoteAudioService.injectRemoteSourceForTest` → `addSource` → a real `MediaStreamAudioSourceNode` in the live mixer graph (service.ts:251-265). So `sources.size > 0` is genuinely true and the running-required branch is the one under test.
- E1 (spec:56-63): reads the **real** `debugSnapshot()` from the product service and asserts on the **real** `.audio-unblock-notice` DOM count — not the mock.
- E2 (spec:80-82): asserts `.audio-unblock-notice` **visible**, real copy `Tap to enable audio`, real `Enable audio` button. The banner is set by the product effect (room.page.ts:587), driven by the real suspended `contextState`.
- E3/E4: click the **real** `Enable audio` button (genuine gesture → product `enableRemoteAudio` → `unlockAudioFromGesture` → `unlockAndPlayRemoteSinks` resume-in-stack), then assert real banner clears.
- The injection hook is acceptable precisely because everything downstream of source-mounting — playability eval, resume re-arm, banner DOM — is genuine product code.

**Honest statement on R1.2/R1.3 given the fake-media limit:** The e2e proves R1.2 (honest banner on suspended+sources) and R1.3 (resume re-armed on gesture and on source-add) **honestly** at the playability-decision + banner-DOM + resume-rearm level. It does NOT prove R1.1's literal `jitterBufferEmittedCount` climb (E6 SOFT, never gates) because no cross-context WebRTC peer connection completes headless — dev disclosed this in the NS5 caveat and falls back to the `suspended→running` + `outputPlaying` snapshot proxy. Live two-machine speaker confirmation remains JROM's seat per NS5. This is the agreed deterministic-proof boundary, not a gap.

### 4. Unit spec (HARD gate a) — PASS
All 10 U-cases present (spec:20-98), each an exact `assert.strictEqual` with a descriptive message, using `import assert from 'node:assert/strict'` and a `console.log('...all assertions passed')` tail. Asserted booleans match the locked rule exactly (U1/U3/U4/U6/U7/U8/U10 → false; U2/U5/U9 → true). The shared `input()` default helper overrides per fixture — not a vacuous always-pass. Mirrors `remote-audio-health.spec.ts` style as required.

### 5. Banner condition correctness — PASS (no false-block of the working majority, NS4)
Effect (room.page.ts:577-587): early-returns unless `state()==='in-call'` AND `remoteAudioMixerEnabled()` AND `hasSources` (`debugSnapshot().mixedPeerIds.length > 0`). Only then sets `remoteAudioBlocked = !(contextState==='running' && outputPlaying)`.
- A guest already hearing audio is `running` + `outputPlaying` ⇒ `!playing === false` ⇒ banner stays hidden. No spurious block.
- Zero-source / pre-call states early-return, leaving the gesture-path write (line 2201, derived from `evaluateRemoteAudioPlayability`) authoritative — consistent with the fn.
- **Consistency between the two writers:** line 2201 uses `evaluateRemoteAudioPlayability` (`!outputPaused`); the effect uses `outputPlaying`. These are not contradictory: after a successful gesture, `output.play()` fires the `playing` event → `outputPlaying=true` and `contextState='running'` ⇒ effect agrees with the gesture verdict (both unblock). The element-event signal is intentionally stricter on the clear side to avoid the transient-`paused` race. No flapping path identified.

---

## Convention Conformance
- New pure module is framework-free with a documented locked rule and exported input type — matches the `remote-audio-health` precedent.
- Test hooks are localhost-guarded at the call site (room.page.ts:544 `isLocalhost` block) per plan D; service methods are no-ops without a context. `__`-prefixed, sitting beside existing localhost debug helpers.
- e2e uses the real fixtures (`e2e/fixtures/{db,auth,rooms}.ts` — `cleanupRoomsByPrefix`/`loginAsJrom`/`createRoomViaApi` all exported), dedicated `B1HOSTAUDIO` prefix with `cleanupRoomsByPrefix` in `beforeAll`/`afterAll`, `?sfu=0` mesh path, `--workers=1` serial mode. TEST_ROOM01 untouched.
- E5 control selectors resolve to real product controls in `controls-bar.component.html` (`Mute/Unmute meeting speakers` :134, `Speaker volume` :143, `input.volume-slider` :159).
- R1.4 guard: `setMutedAll`/`setVolume`/gain (service.ts:54-63) are NOT in the diff — confirmed untouched. Banner HTML (room.page.html:207-210) untouched.

## Required Changes
None.

## Concerns (non-blocking — for qa awareness, not gate)
1. **changes.md Verification claims build/unit/e2e green** — qa must independently re-run (`npx tsx ...playability.spec.ts`; `npm test -w e2e -- e2e/tests/b1-host-audio/ --workers=1`). Review does not run tests.
2. **PRE-EXISTING (flagged by dev, confirmed not a B1 regression):** the `v3-audiofix` reference harness selectors are stale; the B1 harness uses current selectors, so this does not affect B1 gating.
3. **NS5 boundary (expected, not a defect):** E6 `jitterBufferEmittedCount` is proxied by the `suspended→running`/`outputPlaying` snapshot under headless fake-media; real speaker output is JROM's two-machine seat. E6 is SOFT and must never gate — implemented correctly (spec:199-211 fallback branch).

---

**STATUS: DONE** — APPROVE. Mechanism-level root cause (BUG-1 + BUG-2) is implemented in the diff, not merely described; scope is surgical (NS6) with the `outputPlaying`/authoritative-effect addition justified as a same-bug-class mechanism fix within the approved surface; the unit spec covers U1-U10 with exact boolean asserts; the e2e exercises genuine product playability/resume/banner code (real DOM, real `debugSnapshot`, real gesture) with an honest NS5 fake-media disclosure; and the banner condition correctly gates on in-call + sources so the working majority is not false-blocked (NS4). qa to independently re-run unit + e2e gates next.
