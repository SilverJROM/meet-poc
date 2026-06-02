# B1 Scenarios — Host remote-audio playout: honest playability + AudioContext resume

**Batch:** B1
**Branch:** `feat/host-audio-playout-mic-persist-20260601`
**Requirement:** R1 ONLY (R2 mic-persistence is B2 — out of scope here)
**Mode:** Mode 1 (scenarios authored before dev codes)

## Context (verified in code)

- Mixer is the sole remote-audio playout path: `remoteAudioMixerEnabled` = `computed(() => true)` (`room.page.ts:169`); `mixerEnabled()` returns `true` (`remote-audio.service.ts:42-44`); per-tile `<audio>` is silenced when mixer is on.
- A `MediaStreamAudioSourceNode` only pulls samples (`jitterBufferEmittedCount` climbs) when `AudioContext.state === 'running'`. A **suspended** context ⇒ zero emitted ⇒ silence at the host.
- **BUG-1 (detection):** `unlockAndPlayRemoteSinks` (`remote-audio.service.ts:90`) and `allSinksPlaying` (`remote-audio.service.ts:133`) compute playability from `element.paused` ONLY — never `context.state`. A suspended context + non-paused output element returns `allPlayable === true` ⇒ `remoteAudioBlocked` (`room.page.ts:202`, set at `:2169`) never goes true ⇒ banner (`room.page.html:206`, `.audio-unblock-notice`) never surfaces ⇒ host hears nothing with no recovery path.
- **BUG-2 (host re-unlock outside gesture):** the `syncPeers` effect re-unlock fires from `window.setTimeout(..., 0)` (`room.page.ts:553-555`) — outside the user-gesture call stack — so `context.resume()` is silently rejected by the browser and never retried on a genuine gesture or on source-add.

## Approved fix surface (what scenarios assert against)

A pure decision function is extracted (location to be created by dev; expected `frontend/src/app/services/remote-audio-playability.ts` with a sibling `remote-audio-playability.spec.ts`, mirroring `remote-audio-health.spec.ts` `node:assert/strict` style):

```
evaluateRemoteAudioPlayability({
  mixerEnabled, contextState, sourcesCount,
  outputAttached, outputPaused, perPeerAllUnpaused
}) : boolean
```

**Rule (the contract under test):**
- `mixerEnabled && sourcesCount > 0` ⇒ playable **requires** `contextState === 'running' && outputAttached && !outputPaused && perPeerAllUnpaused`.
- `mixerEnabled && sourcesCount === 0` ⇒ falls back to `perPeerAllUnpaused`.
- `!mixerEnabled` ⇒ falls back to `perPeerAllUnpaused`.

`remoteAudioBlocked` banner condition is `!playable` while in-call (`room.page.ts:2169`).

---

## Unit scenarios (decision function) — HARD

These mirror the `node:assert/strict` block style of `remote-audio-health.spec.ts`. Every case is a pure-function input→exact-boolean assertion (no DOM, no browser).

### U1 — suspended context + sources ⇒ NOT playable (banner condition true) — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'suspended', sourcesCount: 1, outputAttached: true, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call `evaluateRemoteAudioPlayability(input)`.
- **Assertion:** `assert.strictEqual(result, false)`. This is the regression-proof for BUG-1: a non-paused element with a suspended context is NOT playable, so `!result === true` ⇒ banner surfaces.

### U2 — running + sources + all unpaused ⇒ playable — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'running', sourcesCount: 1, outputAttached: true, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, true)`.

### U3 — running but output paused ⇒ NOT playable — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'running', sourcesCount: 1, outputAttached: true, outputPaused: true, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)` (paused mixer output is still a blocker even when context runs).

### U4 — running but output not attached ⇒ NOT playable — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'running', sourcesCount: 1, outputAttached: false, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)`.

### U5 — running + ZERO sources ⇒ per-peer fallback (true) — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'running', sourcesCount: 0, outputAttached: true, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, true)` — with no sources, context state is irrelevant; result tracks `perPeerAllUnpaused`.

### U6 — ZERO sources but a per-peer element paused ⇒ fallback false — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'suspended', sourcesCount: 0, outputAttached: true, outputPaused: true, perPeerAllUnpaused: false }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)` — proves the `sourcesCount === 0` branch ignores context/output and returns exactly `perPeerAllUnpaused`.

### U7 — closed context + sources ⇒ NOT playable — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'closed', sourcesCount: 1, outputAttached: true, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)` — `'closed'` is not `'running'`.

### U8 — 'none' context + sources ⇒ NOT playable — **HARD**
- **Precondition:** `{ mixerEnabled: true, contextState: 'none', sourcesCount: 1, outputAttached: true, outputPaused: false, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)` — covers the pre-graph `'none'` snapshot value (`RemoteAudioDebugSnapshot.contextState` can be `'none'`, `remote-audio.service.ts:12`).

### U9 — mixer disabled + sources ⇒ per-peer fallback — **HARD**
- **Precondition:** `{ mixerEnabled: false, contextState: 'suspended', sourcesCount: 2, outputAttached: false, outputPaused: true, perPeerAllUnpaused: true }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, true)` — when the mixer is off, context/output fields are ignored; result is exactly `perPeerAllUnpaused`.

### U10 — mixer disabled + a per-peer element paused ⇒ fallback false — **HARD**
- **Precondition:** `{ mixerEnabled: false, contextState: 'running', sourcesCount: 0, outputAttached: true, outputPaused: false, perPeerAllUnpaused: false }`.
- **Action:** call the fn.
- **Assertion:** `assert.strictEqual(result, false)` — disabled-mixer branch returns exactly `perPeerAllUnpaused`.

---

## E2E scenarios (two-context host+guest, fake media) — HARD / SOFT

Harness conventions reused from `e2e/tests/v3-audiofix/audiofix.spec.ts`: `installAudiofixMedia(page, role)`, `joinOwner`, `admitCameraGuest`, `ensureRemoteAudioEnabled`, `__meetDebug`. New specs live under `e2e/tests/b1-host-audio/`. Run pattern (project_specs.md § 14):
`npm test -w e2e -- e2e/tests/b1-host-audio/ --config=playwright.config.ts --workers=1`.
Cleanup: prefix rooms (e.g. `B1HOSTAUDIO`) and `cleanupRoomsByPrefix` in `beforeAll`/`afterAll` (TEST_ROOM01 `3f324d8be763` must remain untouched).

### E1 — POSITIVE: host joins first, guest joins, enable audio ⇒ context running, output unpaused, banner hidden — **HARD**
- **Roles:** host (page), guest (second context).
- **Precondition:** fresh room created via `createRoomViaApi`; `installAudiofixMedia(host,'host')`; host joins via `joinOwner`; guest admitted via `admitCameraGuest` ⇒ remote tile reaches `connected`.
- **Action:** `await ensureRemoteAudioEnabled(page)` (clicks the `Enable audio` button — a genuine Playwright gesture), then read the mixer snapshot.
- **Assertions (concrete):**
  - `const snap = await page.evaluate(() => window.__meetDebug.remoteAudioMixer.debugSnapshot());`
  - `expect(snap.mixerEnabled).toBe(true)`.
  - `expect(snap.contextState).toBe('running')` — the resume actually took on a gesture.
  - `expect(snap.outputAttached).toBe(true)`.
  - `expect(snap.outputPaused).toBe(false)`.
  - `expect(snap.mixedPeerIds.length).toBeGreaterThan(0)` — at least one source mounted (so the running-required branch is the one under test).
  - Banner hidden: `await expect(page.locator('.audio-unblock-notice')).toHaveCount(0)` (or `.not.toBeVisible()`).
- **Edge note:** poll the snapshot with `expect.poll(...)` (timeout ~8s) because resume + bind settle asynchronously after the click.

### E2 — NEGATIVE: context not running with sources ⇒ "Tap to enable audio" banner surfaces — **HARD**
- **Roles:** host (page), guest (second context).
- **Precondition:** same join sequence as E1 so a remote source exists (`mixedPeerIds.length > 0`), but drive the context into a non-running state to model the autoplay-blocked / suspended reality. Achieve it in-test by suspending the live context after join, e.g.:
  - `await page.evaluate(async () => { await window.__meetDebug.remoteAudioMixer.__suspendForTest?.(); });` — **dev must expose a test-only suspend hook** on the debug snapshot object (localhost-guarded, mirroring the existing `localhost`-only debug helpers at `room.page.ts:534`). If no hook is added, fall back to asserting the banner via the natural pre-gesture state: load host without an audio-unlock gesture and assert the banner appears once a source is added while context is `suspended`.
- **Action:** allow the playability re-evaluation to run (source-add or visibility tick).
- **Assertions (concrete):**
  - `const snap = await page.evaluate(() => window.__meetDebug.remoteAudioMixer.debugSnapshot());`
  - `expect(snap.contextState).not.toBe('running')` and `expect(snap.mixedPeerIds.length).toBeGreaterThan(0)` (precondition holds — sources present, context not running).
  - Banner visible: `await expect(page.locator('.audio-unblock-notice')).toBeVisible()`.
  - Banner copy: `await expect(page.locator('.audio-unblock-notice')).toContainText('Tap to enable audio')`.
  - Enable button present: `await expect(page.getByRole('button', { name: 'Enable audio' })).toBeVisible()`.
- **Why HARD:** this is the user-visible recovery path that BUG-1 silently suppressed. Without it the host has no way back to audio.

### E3 — RECOVERY: tapping "Enable audio" from the E2 blocked state clears the banner and resumes context — **HARD**
- **Roles:** host (page), guest (second context).
- **Precondition:** start from the E2 end-state (banner visible, `contextState !== 'running'`, sources present).
- **Action:** `await page.getByRole('button', { name: 'Enable audio' }).click();` (genuine gesture).
- **Assertions (concrete):**
  - `await expect.poll(() => page.evaluate(() => window.__meetDebug.remoteAudioMixer.debugSnapshot().contextState)).toBe('running')`.
  - `await expect.poll(() => page.evaluate(() => window.__meetDebug.remoteAudioMixer.debugSnapshot().outputPaused)).toBe(false)`.
  - Banner cleared: `await expect(page.locator('.audio-unblock-notice')).toHaveCount(0)`.
- **Why HARD:** proves AC R1.3 — resume + mixer `play()` are re-attempted on a genuine gesture, not only once at join.

### E4 — SOURCE-ADD RE-UNLOCK: a remote source added while context not running triggers a resume attempt — **HARD**
- **Roles:** host (page), late guest (second context joining after host settled).
- **Precondition:** host joins first and is `in-call` with **no** remote peer yet (`mixedPeerIds.length === 0`); host's context may be `suspended` (no gesture forced).
- **Action:** admit a guest **after** the host is settled (`admitCameraGuest`), so a source is added post-join. Then perform one genuine gesture (`ensureRemoteAudioEnabled`) to model the user reacting to the banner.
- **Assertions (concrete):**
  - Before guest: `expect((await snap()).mixedPeerIds.length).toBe(0)`.
  - After guest connects: `await expect.poll(() => snap().then(s => s.mixedPeerIds.length)).toBeGreaterThan(0)`.
  - After the gesture, context resumes: `await expect.poll(() => snap().then(s => s.contextState)).toBe('running')` and `outputPaused` is `false`.
  - Banner not stuck: `await expect(page.locator('.audio-unblock-notice')).toHaveCount(0)`.
  - (`snap = () => page.evaluate(() => window.__meetDebug.remoteAudioMixer.debugSnapshot())`.)
- **Why HARD:** proves AC R1.3's "when a remote source is added while context not running" re-attempt branch — the BUG-2 path where the `setTimeout(0)` re-unlock never resumed.

### E5 — NO REGRESSION: a participant already hearing audio keeps hearing it; volume + mute-all still work — **HARD**
- **Roles:** host (page), guest (second context).
- **Precondition:** start from the E1 positive end-state (`contextState: 'running'`, `outputPaused: false`, banner hidden, sources present).
- **Action + assertions (concrete):**
  - **Stays playable:** wait ~3s, re-read snapshot, assert `contextState === 'running'`, `outputPaused === false`, banner still `toHaveCount(0)` — no spurious re-block.
  - **Mute-all:** toggle mute-all (the existing control that calls `setMutedAll`); assert `snap.mutedAll === true`; un-toggle; assert `snap.mutedAll === false`. Mixer must NOT report `outputPaused` flipping (mute is gain, not pause): `expect(snap.outputPaused).toBe(false)` across both.
  - **Volume:** change volume via the existing control; assert `snap.volume` reflects the new clamped value (range `0`..`1.3`, `remote-audio.service.ts:24`) and `contextState` stays `'running'`.
  - Banner remains hidden throughout: `await expect(page.locator('.audio-unblock-notice')).toHaveCount(0)`.
- **Why HARD:** guards AC R1.4 — the detection tightening must not falsely block, and volume/mute-all must keep working.

### E6 — SOFT: host receiver `jitterBufferEmittedCount` climbs (getStats) — **SOFT (NOT a gate)**
- **Roles:** host (page), guest (second context).
- **Precondition:** E1 positive state (`contextState: 'running'`, source present).
- **Action:** sample the host's inbound-audio RTP stats twice ~2s apart, via `window.__meetDebug.sfuGetStats?.()` (localhost-only helper, `room.page.ts:537`) or `RTCPeerConnection.getStats()` filtered to `type === 'inbound-rtp' && kind === 'audio'`.
- **Assertion (best-effort):** second-sample `jitterBufferEmittedCount` > first-sample value (audio actually rendered through the mixer source node).
- **Honesty clause (NS5):** headless fake-media may not emit a climbing `jitterBufferEmittedCount` (synthetic silent track / no real decode). If the count does not climb under headless fake-media, **report this honestly** in the test output and **fall back** to a localhost `debugSnapshot()` before/after note (contextState `suspended`→`running`, `outputPaused` `true`→`false`) as the rendered-audio proxy. This scenario must **never fail the gate**; a non-climbing count under fake-media is an expected harness limitation, not a product defect.

---

## Scenario → Test mapping

### Unit spec — `frontend/src/app/services/remote-audio-playability.spec.ts` (node:assert/strict)

| Scenario | Test block (suggested) | Asserts | Gate |
|----------|------------------------|---------|------|
| U1 | `evaluateRemoteAudioPlayability: suspended+sources ⇒ false` | `=== false` (banner condition true) | HARD |
| U2 | `running+sources+unpaused ⇒ true` | `=== true` | HARD |
| U3 | `running but outputPaused ⇒ false` | `=== false` | HARD |
| U4 | `running but !outputAttached ⇒ false` | `=== false` | HARD |
| U5 | `running + 0 sources ⇒ per-peer fallback true` | `=== true` | HARD |
| U6 | `0 sources + per-peer paused ⇒ false` | `=== false` | HARD |
| U7 | `closed + sources ⇒ false` | `=== false` | HARD |
| U8 | `'none' + sources ⇒ false` | `=== false` | HARD |
| U9 | `mixer disabled + sources ⇒ per-peer fallback true` | `=== true` | HARD |
| U10 | `mixer disabled + per-peer paused ⇒ false` | `=== false` | HARD |

### E2E — `e2e/tests/b1-host-audio/host-audio.spec.ts` (Playwright, two-context, `--workers=1`)

| Scenario | Test name (scenario-ID prefixed) | Key assertion | Gate |
|----------|----------------------------------|---------------|------|
| E1 | `test('E1: positive — context running, output unpaused, banner hidden')` | `debugSnapshot()` → `contextState:'running'`, `outputPaused:false`; `.audio-unblock-notice` count 0 | HARD |
| E2 | `test('E2: negative — sources + non-running context ⇒ Tap to enable audio banner')` | `.audio-unblock-notice` visible, contains `Tap to enable audio` | HARD |
| E3 | `test('E3: recovery — Enable audio gesture resumes context, clears banner')` | poll `contextState:'running'`, `outputPaused:false`; banner count 0 | HARD |
| E4 | `test('E4: source-add re-unlock — late guest source + gesture resumes context')` | `mixedPeerIds` 0→>0; `contextState:'running'`; banner not stuck | HARD |
| E5 | `test('E5: no regression — stays playable; volume + mute-all work')` | snapshot stable running/unpaused; `mutedAll` toggles; `volume` reflects change | HARD |
| E6 | `test('E6: SOFT — host getStats jitterBufferEmittedCount climbs')` | second sample > first OR honest fake-media fallback note | SOFT |

---

## Notes for the reviewer / implementer

- **Test-only suspend hook (E2/E4):** the cleanest negative path needs a `localhost`-guarded way to drive the live `AudioContext` into `suspended` after a source exists. Recommend dev expose `__suspendForTest()` on the `remoteAudioMixer` debug object (next to the existing `localhost`-gated helpers at `room.page.ts:534-541`). If dev declines the hook, E2/E4 must instead exercise the natural pre-gesture suspended state (assert banner appears before any unlock gesture, with a source present) — note this fallback explicitly in the test report.
- **Cleanup discipline:** all e2e rooms use a dedicated prefix and `cleanupRoomsByPrefix` in `beforeAll`/`afterAll`. Do not touch persistent `TEST_ROOM01` (`3f324d8be763`).
- **`?sfu=0`:** the v3-audiofix harness joins with `?sfu=0` (mesh path). B1 e2e should match whichever path reproduces the host-can't-hear case; default to the same `?sfu=0` mesh used by the reference harness unless the SFU path is required to mount a mixer source.
- **Out of scope:** R2 (mic persistence) — covered in B2, no scenarios here.
