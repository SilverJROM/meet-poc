# Test Report — B2a: Root-cause silent-mic capture (R3)

**Batch:** B2a — tolerant constraints + shared energy reader + post-publish one-shot energy gate + bounded non-destructive recovery
**Requirement:** R3 — Robust microphone selection; on a silent/failed default the app does NOT silently publish a dead track — it attempts recovery and surfaces R2 (B2a = capture-side root-cause fix + recovery half of R3; the R2 banner UI is B2b, out of scope).
**Branch:** `feat/meet-diagnostics-audio-20260529`
**Commit (HEAD):** `b8fa5f7` (B2a) on top of B1 `3c1ebff`
**Tested against:** unit (node-assert via `tsx`, headless) + structural/static checks + both builds. Live mic path (M-1..M-3) = **MANUAL-PENDING** per NS5.
**Date:** 2026-05-30
**QA:** [qa] Mode 2 — Testing

> **NS5 constraint:** WebRTC real-mic capture cannot be exercised by a headless browser, so the live silent-mic behavior (M-1..M-3) is carried as **MANUAL-PENDING** for JROM's USER seat — not faked, not claimed PASS. The deterministic proof is the pure-function unit suite + structural/static checks, mirroring the accepted B1 pattern.

---

## 1. Unit Tests (headline evidence)

**Run dir:** `frontend/`  **Captured to:** `screenshots/unit-tests-b2a.txt`

### 1a. B2a primary spec — `mic-capture-health.spec.ts`

**Command:**
```
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-capture-health.spec.ts
```

**Exact stdout:**
```
mic-capture-health: all assertions passed
```
**Exit code:** `0`

The spec uses B1's convention: one `node:assert/strict` assertion per scenario, throwing on first failure, with a single terminal `console.log` on full pass. EXIT=0 + the success line ⇒ every assertion below passed. Each scenario maps to the `mic-capture-health.spec.ts` line shown.

### 1b. B1 regression — `mic-energy.spec.ts`

**Command:**
```
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-energy.spec.ts
```

**Exact stdout:**
```
mic-energy: all assertions passed
```
**Exit code:** `0` — **no B1 regression** (the shared `mic-energy.ts` module that B2a extends still satisfies all B1 assertions).

### Coverage table (B2a)

| # | Scenario | Spec:Line | Input | Expected | Actual (from run) | Result |
|---|----------|-----------|-------|----------|-------------------|--------|
| **AC1 — tolerant constraints** | | | | | | |
| U-1 | EC/NS/AGC `{ideal:true}`, deviceId `{exact}` when chosen; NOT bare `true` | `:22-31` | `audioCaptureConstraints(true,'mic-abc-123')` | EC/NS/AGC deep-eq `{ideal:true}`; deviceId `{exact:'mic-abc-123'}`; `≠ true` | all 5 assertions passed | PASS |
| U-2 | No device ⇒ no `deviceId` key, still `{ideal:true}` | `:33-40` | `audioCaptureConstraints(true)` | `'deviceId' in c === false`; EC/NS/AGC `{ideal:true}` | all 4 assertions passed | PASS |
| U-3 | `audio:false` short-circuits to boolean `false` | `:42-46` | `audioCaptureConstraints(false, …)` | strictly `false` (with + without device) | both assertions passed | PASS |
| **AC2 — one shared extractor (source of truth)** | | | | | | |
| U-4 | Extractor returns the media-source/audio values, ignores noise | `:52-60` | stats w/ candidate-pair + video media-source + audio media-source(0.37,88.5) | `{audioLevel:0.37, totalAudioEnergy:88.5}` | passed | PASS |
| U-5 | Gate read == diagnostics read (same extractor) | `:62-76` | same synthetic stats | two `extractOutboundAudioSource` calls deep-equal + equal expected | passed | PASS |
| U-6 | No audio source ⇒ null; partial fields ⇒ null per field | `:78-91` | no-audio / `{audioLevel:0.2}` / `{totalAudioEnergy:1.5}` | `null` / `{0.2,null}` / `{null,1.5}` | all 3 assertions passed | PASS |
| **AC3 — sustained discriminator (LOCKED)** | | | | | | |
| U-7 | Flat energy + low level ⇒ SILENT (the bug caught) | `:97-101` | 6× `{energy:0.0001, level:0.003}` | `'silent'` | passed | PASS |
| U-8 | Rising energy + low level ⇒ WORKING (quiet-but-working boundary) | `:103-107` | energy `0.50→0.55`, level `0.004` | `'working'` | passed | PASS |
| U-9 | Loud + rising energy ⇒ WORKING | `:109-113` | energy `2.0→11.0`, level `0.3` | `'working'` | passed | PASS |
| U-10 | Flat energy but level ABOVE threshold ⇒ NOT silent | `:115-119` | 6× `{energy:5.0, level:0.4}` | `≠ 'silent'` | passed | PASS |
| U-11 | Insufficient / all-null / empty window ⇒ indeterminate | `:121-131` | 1 sample / all-null energy / `[]` | `'indeterminate'` ×3 | all 3 assertions passed | PASS |
| **AC4/AC5 — bounded non-destructive recovery** | | | | | | |
| U-12 | Silent + eligible + not-attempted ⇒ reacquire SAME device | `:146-152` | eligibleSilent, device `'mic-abc-123'` | `{action:'reacquire-same-device', deviceId:'mic-abc-123'}` | passed | PASS |
| U-13 | Already attempted ⇒ NO second reacquire (one-shot bound) | `:154-158` | eligibleSilent + `alreadyAttempted:true` | `action ≠ 'reacquire-same-device'` | passed | PASS |
| U-14 | working / indeterminate classification ⇒ `'none'` | `:160-164` | eligibleSilent w/ classification overridden | `action === 'none'` ×2 | passed | PASS |
| U-15 | Gating: disabled OR muted OR no-live-track ⇒ `'none'` | `:166-172` | silent + each gate off | `action === 'none'` ×3 | passed | PASS |
| U-16 | Still-silent after attempt ⇒ KEEP-AND-WARN; no destructive action in union | `:174-180` | silent + `alreadyAttempted:true` | `action === 'keep-and-warn'`; action ∈ {reacquire,keep-and-warn,none} | both assertions passed | PASS |
| U-17 | Re-acquire always targets the selected device id (AC5, parametrized) | `:182-190` | device ∈ {`mic-abc-123`,`usb-scarlett-2`,undefined} | reacquire `deviceId === input` | passed | PASS |
| (extra) | Threshold constant sanity | `:192-195` | — | `MIC_SILENCE_LEVEL_THRESHOLD === 0.01` | passed | PASS |

**Unit summary: 18 B2a scenarios (U-1..U-17 + threshold) all PASS; B1 `mic-energy.spec.ts` regression PASS.**

### Acceptance-criteria roll-up

| AC | Asserts | Backed by | Result |
|----|---------|-----------|--------|
| AC1 | EC/NS/AGC `{ideal}` + deviceId `{exact}`; `audio:false`→`false` | U-1..U-3 | PASS |
| AC2 | One shared extractor → same values diagnostics reads | U-4..U-6 + S-1/S-5 static | PASS |
| AC3 | Sustained discriminator incl. quiet-but-working (U-8) boundary | U-7..U-11 | PASS |
| AC4 | Recovery one-shot, gated, keep-track-on-fail, never zero tracks | U-12..U-16 + S-4 static | PASS |
| AC5 | Re-acquire same device only (no silent switch) | U-12, U-17 + S-6 static | PASS |

---

## 2. Structural / Static Checks

**Captured to:** `screenshots/structural-checks-b2a.txt` (full command output). All run at `b8fa5f7`.

### S-1 (U-5/AC2) — exactly ONE executable `media-source` extraction definition
```
$ grep -rn "stat.type === 'media-source'" frontend/src/app/services/
frontend/src/app/services/mic-energy.ts:69:    if (stat && stat.type === 'media-source' && stat.kind === 'audio') {
```
Only **one** executable extraction site (the shared `extractOutboundAudioSource` in `mic-energy.ts:69`). Other `media-source` matches in `mic-energy.ts` (62,63,196) and `sfu-client.service.ts` (191,355) are **comments** — `collectDiagnostics` no longer has its own inline loop; it calls the shared extractor (`sfu-client.service.ts:356`). **PASS** — one source of truth.

### S-2 (U-18) — NO new AudioContext / AnalyserNode introduced by B2a
```
$ git diff 3c1ebff..b8fa5f7 -- frontend/src/app | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
(no added matches — energy gate reuses getStats only)
```
**PASS** — the energy gate reuses the `pc.getStats()` outbound-audio source; zero new Web-Audio meter. (Pre-existing lobby preview meter in `media.service` untouched.)

### S-3 (U-19) — gate hooked in the `published` block + guarded one-shot
```
$ grep -n "verifyInitialCaptureEnergy|initialCaptureEnergyChecked|state?.status === 'published'" room.page.ts
386:  private initialCaptureEnergyChecked = false;
1322:          if (state?.status === 'published') {
1330:            void this.verifyInitialCaptureEnergy();
1945:    this.initialCaptureEnergyChecked = false;     // reset in cleanupCall()
2246:  private async verifyInitialCaptureEnergy(): Promise<void> {
2247:    if (this.initialCaptureEnergyChecked) return; // one-shot guard
2248:    this.initialCaptureEnergyChecked = true;
```
Verified by reading `room.page.ts:1318-1331`: `void this.verifyInitialCaptureEnergy()` (line 1330) sits **inside** the `if (state?.status === 'published')` block (1322-1331), immediately after the `sfu-publish` send — post-INITIAL-publish, not per diagnostics tick. The one-shot flag `initialCaptureEnergyChecked` (declared 386) guards entry (2247-2248) and is **reset in `cleanupCall()` at 1945** so a fresh join re-arms it. No continuous mid-call polling (that is B2b). **PASS.**

### S-4 (U-16) — recovery path does NOT use the destructive `removeAudioTrack`/`recoverLocalAudioTrack`
```
$ sed -n '2246,2296p' room.page.ts | grep -nE 'removeAudioTrack|recoverLocalAudioTrack\('
24:    // destructive recoverLocalAudioTrack() path.   <-- COMMENT only (line 2269)
```
Read of the gate body (`room.page.ts:2246-2296`): on confirmed silence it performs **one** `this.media.replaceAudioTrack(decision.deviceId, …)` (2272) — non-destructive, keeps the old track until the new one is live; a throw leaves the old track in place. On still-silent / unavailable it sets `deviceFailureNotice` and keeps the existing track (2294-2295) — **never** `removeAudioTrack()`, **never** `recoverLocalAudioTrack()`, never zero tracks. The only match in the slice is the **comment** at 2269 explicitly ruling that destructive path out. The grep hits at 2194/2202/2228 are the **pre-existing** `onended`/`onmute` destructive recovery path — separate from the gate, not invoked by it. **PASS.**

### S-5 — shared public reader `getOutboundAudioSource` is the gate's sampling primitive
```
$ grep -n 'getOutboundAudioSource|extractOutboundAudioSource' sfu-client.service.ts
8:import { extractOutboundAudioSource, type OutboundAudioSourceStat } from './mic-energy';
193:  async getOutboundAudioSource(): Promise<OutboundAudioSourceStat | null> {
202:    return extractOutboundAudioSource(stats);
356:    const outboundAudioSource: OutboundAudioSourceStat | null = extractOutboundAudioSource(stats);
```
The gate samples via `getOutboundAudioSource()` (193-202) which does one `getStats()` then the **same** `extractOutboundAudioSource` that `collectDiagnostics` uses (356). One source of truth confirmed at the wiring level. **PASS.**

### S-6 (AC1/AC5) — `media.service` delegates to the shared pure builder; old hard-const gone
```
$ grep -n 'audioCaptureConstraints|audioConstraints|AUDIO_PROCESSING_CONSTRAINTS' media.service.ts
3:import { audioCaptureConstraints } from './mic-energy';
352:  private audioConstraints(audio: boolean, deviceId?: string): boolean | MediaTrackConstraints {
355:    return audioCaptureConstraints(audio, deviceId);
```
`AUDIO_PROCESSING_CONSTRAINTS` (the old hard-boolean const) is **gone** (no match). `private audioConstraints()` now delegates to the shared pure `audioCaptureConstraints` — the exact AC1 unit-test surface — and is wired at the three acquire/replace call-sites (62, 80, 92). **PASS.**

**Structural summary: 6/6 (S-1..S-6) PASS.**

---

## 3. Build (re-confirmed green)

**Captured to:** `screenshots/builds-b2a.txt`

### Backend — `cd backend && npm run build`
```
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
BACKEND_EXIT=0
```
**PASS.**

### Frontend — `cd frontend && npm run build`
```
Application bundle generation complete. [2.820 seconds] - 2026-05-30T00:57:28Z
...
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
FRONTEND_EXIT=0
```
**PASS.** Warnings present are all **pre-existing** (documented in B1) and unrelated to B2a: `NG8113 DatePipe unused in RoomsPage`, Stencil `empty-glob`, `@mediapipe/selfie_segmentation` CommonJS. No new errors, no new warnings.

**Build summary: backend PASS, frontend PASS.**

---

## 4. App-render smoke (best-effort — NOT a gate)

A local server was already up (PM2 `meet-poc-fe` + `meet-poc-be` online; `curl http://localhost:4700` → HTTP 200), so a best-effort Playwright load was run against the running app at `b8fa5f7` to evidence the diff doesn't break render.

**Captured to:** `screenshots/app-render-smoke-b2a.txt` + `screenshots/app-render-landing-b2a.png`
```
PAGE_TITLE=VoiceLokal
CONSOLE_ERROR_COUNT=0
SMOKE_DONE
```
The VoiceLokal sign-in/landing page renders cleanly with **zero console errors / zero pageerrors**. (This is the auth gate ahead of the lobby; deeper room render needs a seeded login + real mic and is covered by the MANUAL-PENDING steps below, not by this smoke.) Evidence only — no live mic exercised here.

---

## 5. Manual Live Path (M-1..M-3) — MANUAL-PENDING (NS5)

> **Status: MANUAL-PENDING — NOT RUN HEADLESS.** Per NS5 a headless browser cannot capture a real microphone, so the end-to-end join → silent-track → keeps-audio behavior must be run by JROM at his USER seat. These are deterministically backed by the unit suite (§1) above (U-7 reproduces the silent classification the live bug hit; U-8 the quiet-but-working boundary; U-12/U-16 the one-shot + keep-and-warn). **No manual PASS is claimed.** Procedure transcribed from `scenarios.md` §M-* and `changes.md` §Verification.

**Preconditions:** `cd frontend && npm run build && pm2 restart meet-poc-fe`. Open `http://localhost:4700` in two sessions: host (normal window) + guest (incognito). Grant mic permission. Read results in the Diagnostics view / diagnostics log payload (`outboundAudioEnergy`, `micSilent`) and watch for the `deviceFailureNotice` banner.

### M-1 — Healthy mic: gate runs once, classifies WORKING, no recovery, no warn — MANUAL-PENDING
- **Given** host joins with a real working mic, unmuted, and speaks during the first ~3s after publish.
- **Expect:** diagnostics `outboundAudioEnergy` INCREASING across samples + `micSilent:false`; **NO** `deviceFailureNotice` ("We can't detect sound…") banner; **NO** re-acquire (mic device unchanged, no "Reconnecting…" actionNotice); audio audible to the guest.
- **Screenshot to capture:** diagnostics row(s) with rising `outboundAudioEnergy` + `micSilent:false`, and the clean no-notice UI.

### M-2 — Forced-silent track: ONE recovery on SAME device, then KEEP audio + warn — MANUAL-PENDING
- **Given** host joins with a forced-silent audio track (enabled + unmuted + live, but flat `totalAudioEnergy` — e.g. a 0-gain WebAudio oscillator track, or a DevTools override pinning `audioLevel`/`totalAudioEnergy` flat). *Test harness only — must not ship.*
- **Expect (the R3 core outcome):** (1) classification = silent (flat energy + low level); (2) EXACTLY ONE re-acquire fires, targeting the SAME `selectedAudioId` (device id unchanged in console/diagnostics — NOT a switch); (3) if the re-acquired track is also silent, the app KEEPS the existing track — `localStream().getAudioTracks().length` stays ≥ 1 (not stopped/removed) — and sets `deviceFailureNotice` = "We can't detect sound from your microphone. Open devices to pick another."; (4) NO second re-acquire (bound respected) even with energy still flat.
- **Observe:** audio-track count never drops to 0; `deviceFailureNotice` non-null with the expected copy; recovery counter == 1.
- **Screenshot to capture:** the `deviceFailureNotice` banner + a console/diagnostics line proving one attempt on the same device id + audio-track-count ≥ 1.

### M-3 — Muted host: no recovery (gating) — MANUAL-PENDING
- **Given** host joins muted (`track.enabled=false`) or mutes before the gate window.
- **Expect:** NO recovery fires and NO `deviceFailureNotice` — an intentionally muted user is never treated as a capture failure.
- **Screenshot to capture:** muted UI with no failure banner and no "Reconnecting…" notice.

---

## 6. Out of Scope (not tested here)

B2b (in-call watchdog banner, "Switch microphone" UI, mid-call continuous polling, banner-clear-on-recovery) does **not exist yet** and was **not** tested. Also out of scope: B3 toggle, B4 attribution/remote-audio, B5 self-test, B6 back-to-rooms, and the pre-existing lobby `AnalyserNode` preview meter (must not regress; not re-tested).

---

## Summary

| Category | Count | Result |
|----------|-------|--------|
| Unit assertions — B2a (`mic-capture-health.spec.ts`, U-1..U-17 + threshold) | 18 scenarios | ALL PASS |
| Unit regression — B1 (`mic-energy.spec.ts`) | green | PASS (no regression) |
| Structural / static (S-1..S-6) | 6 | ALL PASS |
| Backend build | — | PASS (EXIT=0) |
| Frontend build | — | PASS (EXIT=0) |
| App-render smoke (best-effort, not a gate) | — | renders, 0 console errors |
| Manual live mic (M-1..M-3) | 3 | MANUAL-PENDING (NS5 — not faked) |

All deterministic checks pass: the pure-function unit suite is fully green (incl. the LOCKED quiet-but-working boundary U-8, one-shot bound U-13/U-16, same-device-only U-12/U-17, non-destructive keep-and-warn U-16), all 6 structural checks hold (one shared extractor, no new AudioContext, gate in the published block + guarded one-shot reset in cleanupCall, recovery non-destructive), and both builds are green. B1 is not regressed. The live silent-mic path (M-1..M-3) is carried as MANUAL-PENDING for JROM's USER seat per NS5 and is deterministically backed by the unit suite.

---

## Verdict: PASS

Unit suite fully green AND structural checks hold AND both builds green, with M-1..M-3 explicitly carried as MANUAL-PENDING (not faked, not claimed). Matches the accepted B1 evidence pattern.

---

STATUS: DONE

---
---

# Test Report: Batch 2b — In-call SUSTAINED silent-mic WATCHDOG + non-blocking "Switch microphone" banner (R2)

**Batch:** B2b — continuous in-call watchdog (~1s poll, ~5-6s rolling window) reusing B2a's `classifyMicCapture()` + `getOutboundAudioSource()`, driving a NEW pure reducer `nextMicWarningState()` into a single `micSilentWarning` signal → a non-blocking `.device-notice` banner ("We can't detect sound from your microphone" + "Switch microphone"); WARN-ONLY (never auto-switches); unifies B2a's one-shot fallback onto the same surface.
**Requirement:** R2 — Silent-mic detection + actionable warning (non-blocking, actionable prompt; offers to switch mic; clears when audio detected).
**Branch:** `feat/meet-diagnostics-audio-20260529`
**Commit (HEAD):** `1ba17b5` (B2b) on top of B2a `b8fa5f7`
**Tested against:** unit (node-assert via `tsx`, headless) + structural/static checks + both builds + best-effort render smoke. Live silent-mic banner path (M-4..M-8) = **MANUAL-PENDING** per NS5.
**Date:** 2026-05-30
**QA:** [qa] Mode 2 — Testing

> **NS5 constraint (load-bearing):** the live banner appear/clear path needs a forced-SILENT *published* track. The Playwright fake-media flag emits a TONE (always classifies `'working'`), so headless CANNOT deterministically force a silent published track — M-4..M-8 are carried as **MANUAL-PENDING** for JROM's USER seat. They were **not faked** and **no manual PASS is claimed**. The deterministic proof is the pure-function unit suite + structural/static checks + green builds, mirroring the accepted B1/B2a pattern.

---

## 1. Unit Tests (headline evidence)

**Run dir:** `frontend/`  **Captured to:** `screenshots/unit-tests-b2b.txt`

### 1a. B2b primary spec — `mic-capture-health.spec.ts` (extended with the B2b reducer + window cases)

**Command:**
```
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-capture-health.spec.ts
```
**Exact stdout:**
```
mic-capture-health: all assertions passed
```
**Exit code:** `0`

The spec uses the B1/B2a convention: one `node:assert/strict` assertion per scenario (throws on first failure) with a single terminal `console.log` on full pass. **EXIT=0 + the success line ⇒ every assertion below passed.** The B2b assertions were verified present in the spec (lines mapped below) — the `nextMicWarningState` import at `:7`, the exhaustive truth table at `:228-248`, and the window cases at `:255-287`.

### 1b. B1/B2a regression — `mic-energy.spec.ts`

**Command:**
```
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-energy.spec.ts
```
**Exact stdout:**
```
mic-energy: all assertions passed
```
**Exit code:** `0` — **no B1/B2a regression** (the shared `mic-energy.ts` that B2b extends with `nextMicWarningState` still satisfies all B1/B2a assertions; `classifyMicCapture` reused unchanged).

### Coverage table (B2b)

| # | Scenario | Spec:Line | Input | Expected | Actual (from run) | Result |
|---|----------|-----------|-------|----------|-------------------|--------|
| **AC-B1 — pure warn-state reducer (the headline)** | | | | | | |
| U-20 | `silent`⇒show; `working`⇒clear (core transitions, micActive=true) | `:205-211` | `nextMicWarningState(c, 'silent'/'working', true)` | `(false,'silent')→true`, `(true,'silent')→true`, `(true,'working')→false`, `(false,'working')→false` | all 4 assertions passed | PASS |
| U-21 | `micActive=false` ⇒ ALWAYS false (mute gating, both current states) incl. mute-while-shown | `:213-219` | for each class × current, `micActive=false` | `false` ×6 (incl. `(true,'silent',false)→false` = AC-B4 mute-while-shown) | all passed | PASS |
| U-22 | `indeterminate` ⇒ UNCHANGED (no flicker), micActive=true | `:222-226` | `(true,'indeterminate',true)`, `(false,'indeterminate',true)` | `true`, `false` (= current) | both passed | PASS |
| AC-B1 truth table | EXHAUSTIVE 3×2×2: every classification × micActive × current | `:228-248` | all 12 combos vs locked formula (`!micActive→false`; `silent→true`; `working→false`; `indeterminate→current`) | all 12 match | all 12 passed | PASS |
| U-23 | Auto-clear pair: shown→working clears WITHOUT user action | `:250-253` | `(true,'working',true)` | `false` (no Dismiss click needed) | passed | PASS |
| **AC-B2 / AC-B3 — window feeds the EXISTING classifier (reused unchanged)** | | | | | | |
| U-24 | FLAT energy + level<0.01 across ~5s window ⇒ `'silent'` ⇒ banner shows | `:255-260` | 6× `{energy:12.5, level:0.004}` | `classify='silent'`; `nextMicWarningState(false,'silent',true)=true` | both passed | PASS |
| U-25 | Energy ROSE anywhere (speech-then-pause / DTX) ⇒ `'working'` ⇒ NO banner | `:262-267` | `[10,10,11.7,12.4,12.4,12.4]`, level 0.003 | `classify='working'`; reducer → `false` | both passed | PASS |
| U-26 | Auto-clear over a window SEQUENCE: silent-window then working-window | `:269-278` | silentWindow then workingWindow, reducer applied across 2 polls | `true` then `false` (cleared on its own) | both passed | PASS |
| U-27 | Mute mid-silence clears over a window sequence | `:280-287` | silent-window→shown, then `micActive=false` while window still flat | `true` then `false` (mute clears) | both passed | PASS |

**Unit summary: all B2b scenarios (U-20..U-27 incl. the exhaustive 3×2×2 reducer truth table) PASS; B1/B2a `mic-energy.spec.ts` regression PASS.**

### Acceptance-criteria roll-up (unit-provable half)

| AC | Asserts | Backed by | Result |
|----|---------|-----------|--------|
| AC-B1 | Reducer truth table: `micActive=false⇒false`; `silent⇒true`; `working⇒false`; `indeterminate⇒unchanged` (all 8 distinct transition pairs; full 3×2×2 = 12 asserted) | U-20..U-23 + truth table | PASS |
| AC-B2 | Flat ~5s window ⇒ silent ⇒ banner; energy-rose-anywhere ⇒ working ⇒ NO banner | U-24, U-25 | PASS |
| AC-B3 | Auto-clear: shown→working clears without user action; `indeterminate` ⇒ no flicker | U-23, U-22, U-26 | PASS |
| AC-B4 | Mute gating: muted/disabled ⇒ no banner; muting WHILE shown ⇒ clears | U-21, U-27 | PASS |

---

## 2. Structural / Static Checks

**Captured to:** `screenshots/structural-checks-b2b.txt` (full command output). All run at `1ba17b5`. **6/6 PASS.**

### S-1 (U-28 / AC-B5, WARN-ONLY) — the watchdog poll body has ZERO device-mutation calls
```
$ awk '/private async pollMicSilenceWatchdog/,/^  }$/' room.page.ts \
    | grep -nE 'replaceAudioTrack|recoverLocalAudioTrack|removeAudioTrack|getUserMedia|changeAudioDevice'
<no matches>
```
The `pollMicSilenceWatchdog()` body (room.page.ts:2481-2507) contains NONE of `replaceAudioTrack` / `recoverLocalAudioTrack` / `removeAudioTrack` / `getUserMedia` / `changeAudioDevice`. Read of the body confirms it ONLY: self-stops if not in-call, computes `micActive`, reads `getOutboundAudioSource()`, pushes to the rolling window (capped at 6), classifies via `classifyMicCapture`, and sets `micSilentWarning` via `nextMicWarningState`. **PASS — warn-only; the B2b-vs-B2a distinction holds (no mid-call auto-thrash).**

### S-2 (U-30 / U-31, AC-B7 lifecycle) — own ~1s interval, started at publish adjacent to the diagnostics logger, cleared+nulled in `cleanupCall`
```
50:const MIC_SILENCE_WATCHDOG_POLL_MS = 1_000;
372:  private micSilenceWatchdogTimer: ReturnType<typeof setInterval> | null = null;
1348:      this.startDiagnosticsLogger();
1349:      this.startMicSilenceWatchdog();          <-- started at publish, adjacent to the diagnostics logger
1947:    this.stopMicSilenceWatchdog();             <-- cleared in cleanupCall()
1986:    this.micSilentWarning.set(false);          <-- banner reset in cleanupCall()
2467:  private startMicSilenceWatchdog(): void {
2468:    if (this.micSilenceWatchdogTimer || this.state() !== 'in-call') return;   <-- no double-arm; in-call only
2470:    this.micSilenceWatchdogTimer = window.setInterval(..., MIC_SILENCE_WATCHDOG_POLL_MS);
2475:  private stopMicSilenceWatchdog(): void { clearInterval(...); timer = null; window = []; }
2484:      this.stopMicSilenceWatchdog();           <-- poll self-stops when state() !== 'in-call'
```
Its OWN `MIC_SILENCE_WATCHDOG_POLL_MS = 1000` interval (not the 7.5s diagnostics logger, not the one-shot B2a gate), started at publish completion **adjacent to `startDiagnosticsLogger()`** (1348/1349), **cleared and nulled in `cleanupCall()`** (1947 → `stopMicSilenceWatchdog` clears the interval, nulls `micSilenceWatchdogTimer` at 2477, clears the buffer), with `micSilentWarning` reset to false at 1986. The poll self-stops if no longer in-call (2483-2485) so a stale tick can't warn after leaving. **PASS — no leaked interval; clean re-arm on rejoin.**

### S-3 (U-28 / U-29, AC-B5 / AC-B6) — banner exact text + "Switch microphone"→`openInCallDeviceDialog` + `role="status"` (non-modal)
```
194:      @if (micSilentWarning()) {
195:        <div class="device-notice" role="status">
196:          <span>We can't detect sound from your microphone</span>
197:          <button type="button" (click)="openInCallDeviceDialog()">Switch microphone</button>
198:        </div>
199:      }
```
The banner is a single `<div class="device-notice" role="status">` rendered inline in the SAME `@if`-guarded notice stack as `deviceFailureNotice` (188) and the other `.device-notice` banners — NOT inside `app-device-dialog`, not a full-screen overlay. **Exact rendered text** is `We can't detect sound from your microphone` (no trailing period, no "Open devices to pick another." sentence — the locked R2 copy). The action button label is exactly `Switch microphone` and binds `(click)="openInCallDeviceDialog()"` (room.page.ts:837 → sets `inCallDeviceDialogOpen.set(true)` at 839, opening the existing in-call picker). **PASS.**

### S-4 (U-32, AC-B8 UNIFY) — the old `deviceFailureNotice` silent-mic copy is GONE; the silent-mic copy lives in the HTML banner only
```
$ grep -nE "deviceFailureNotice.set\(.We can.t detect sound|Open devices to pick another" room.page.ts
<no matches>
$ grep -c "We can't detect sound from your microphone" room.page.ts
0
```
B2a's old `deviceFailureNotice.set("We can't detect sound…Open devices to pick another.")` fallback is **removed** — ZERO matches in room.page.ts, and the silent-mic copy appears **0** times in the `.ts` (it lives ONLY in the HTML banner at room.page.html:196, driven by `micSilentWarning`). The B2a one-shot still-silent fallback in `verifyInitialCaptureEnergy()` now sets `this.micSilentWarning.set(true)` (room.page.ts:2310). **PASS — old fallback copy gone; one warn surface.**

### S-5 (AC-B8) — `micSilentWarning` is the single silent-mic warn surface; reset in `cleanupCall`
```
172:  readonly micSilentWarning = signal(false);                                   <-- single signal
1986:    this.micSilentWarning.set(false);                                          <-- reset in cleanupCall
2310:    this.micSilentWarning.set(true);                                           <-- B2a one-shot fallback re-pointed here
2494:    this.micSilentWarning.set(nextMicWarningState(..., 'indeterminate', false));<-- watchdog: muted/disabled clear
2506:    this.micSilentWarning.set(nextMicWarningState(..., classification, true));  <-- watchdog: classified poll
```
BOTH the continuous watchdog (2494, 2506) AND the B2a one-shot still-silent fallback (2310) drive the SAME `micSilentWarning` signal → ONE rendered banner. The watchdog's `'working'`⇒false auto-clear therefore also clears the one-shot-raised case. `micSilentWarning` is reset to false in `cleanupCall` (1986). **PASS — single surface, no double-warn.**

### S-6 (no new meter) — `git diff b8fa5f7..1ba17b5` adds NO `new AudioContext` / `AnalyserNode` / `createMediaStreamSource`
```
$ git diff b8fa5f7..1ba17b5 -- frontend/src | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
<no added matches>
```
The watchdog reuses B2a's `getOutboundAudioSource()` (the `pc.getStats()` outbound-audio source) + the pure `classifyMicCapture()` — it introduces ZERO new Web-Audio meter. (Pre-existing lobby preview meter in `media.service` untouched.) **PASS.**

**Structural summary: 6/6 (S-1..S-6) PASS.**

---

## 3. Builds (re-confirmed green at 1ba17b5)

**Captured to:** `screenshots/builds-b2b.txt`

### Backend — `cd backend && npm run build`
```
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
BACKEND_EXIT=0
```
**PASS.**

### Frontend — `cd frontend && npm run build`
```
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
FRONTEND_EXIT=0
```
**PASS.** The three warnings present (`NG8113 DatePipe unused in RoomsPage`, Stencil `empty-glob`, `@mediapipe/selfie_segmentation` CommonJS) are all **pre-existing** (documented in B1/B2a) and unrelated to B2b. No new errors, no new warnings.

**Build summary: backend PASS, frontend PASS.**

---

## 4. App-render smoke (best-effort — NOT a gate)

A local server was already up (PM2 `meet-poc-fe` + `meet-poc-be` online; `curl http://localhost:4700` → HTTP 200). A best-effort Playwright load was run against the running app to evidence the diff doesn't break render. **No long server was started/restarted** (the running PM2 instance was left as-is).

**Captured to:** `screenshots/app-render-smoke-b2b.txt` + `screenshots/b2b-app-render.png`
```
PAGE_TITLE=VoiceLokal
CONSOLE_ERROR_COUNT=0
SMOKE_DONE
```
The VoiceLokal sign-in/landing page renders cleanly with **zero console errors / zero pageerrors**. (This is the auth gate ahead of the lobby; the in-call banner needs a seeded login + a forced-silent published track, covered by the MANUAL-PENDING steps below, not by this smoke.) Evidence only — no live mic / no banner exercised here.

---

## 5. Manual Live Path (M-4..M-8) — MANUAL-PENDING (NS5)

> **Status: MANUAL-PENDING — NOT RUN HEADLESS, NOT FAKED.** Per NS5 the live banner appear/clear path needs a forced-SILENT *published* track; the Playwright fake-media flag emits a TONE (always classifies `'working'`), so headless CANNOT deterministically force a silent published track. These must be run by JROM at his USER seat with a **forced-silent track harness** (a 0-gain WebAudio oscillator track published as the mic, OR a DevTools override pinning the media-source `audioLevel`/`totalAudioEnergy` flat — **test harness only, must NOT ship**). They are deterministically backed by the unit suite (§1): U-24 reproduces the flat-window silent classification that raises the banner; U-25 the speech-then-pause (DTX) working case that must NOT; U-26 the auto-clear sequence; U-21/U-27 the mute gating. **No manual PASS is claimed.** Procedure transcribed from `scenarios.md` §M-* and `changes.md` §Verification.

**Preconditions:** `cd frontend && npm run build && pm2 restart meet-poc-fe`. Open `http://localhost:4700`, seed a login, join a room in-call. Drive the silent path with the forced-silent harness above. Watch the `micSilentWarning` banner appear/clear and the in-call device picker (`inCallDeviceDialogOpen`).

### M-4 — Sustained silence ⇒ banner appears within the ~5s window (AC-B2) — MANUAL-PENDING
- **Given** the host joins in-call with a forced-silent audio track (enabled + unmuted + live, flat `totalAudioEnergy`, `audioLevel<0.01`).
- **Expect:** within ~5-6s (the ~1s watchdog fills its ~5-6 sample window and classifies `'silent'`) a NON-BLOCKING banner appears reading exactly **"We can't detect sound from your microphone"** with a **"Switch microphone"** button; call controls remain usable behind it (no modal).
- **Screenshot to capture:** the banner (exact text + "Switch microphone" button) over a still-operable call UI.

### M-5 — Auto-clear: energy returns ⇒ banner disappears WITHOUT a click (AC-B3) — MANUAL-PENDING
- **Given** the banner is visible (from M-4), then swap the forced-silent track for the real working mic (or release the 0-gain override) so energy rises.
- **Expect:** the next ~1s polls fill a window that classifies `'working'` ⇒ the banner CLEARS on its own within ~1-2 polls, no Dismiss click; `'indeterminate'` interim polls cause NO flicker (it neither re-appears nor toggles).
- **Screenshot to capture:** before (banner) → after (banner gone) with no user interaction between.

### M-6 — Mute gating: muting clears / silence-while-muted never warns (AC-B4) — MANUAL-PENDING
- **Given** (a) host is muted (`track.enabled=false`) with a silent window ⇒ NO banner ever appears; (b) banner showing from M-4, then host clicks mute ⇒ banner CLEARS.
- **Expect:** an intentionally muted user is never warned; muting while shown dismisses it.
- **Screenshot to capture:** muted UI with no silent-mic banner (case a) and banner-gone-after-mute (case b).

### M-7 — Action + non-blocking + single surface (AC-B5/B6/B8) — MANUAL-PENDING
- **Given** the banner is visible (M-4).
- **When** the host clicks **"Switch microphone"**.
- **Expect:** the EXISTING in-call device picker opens (`inCallDeviceDialogOpen` true; the `app-device-dialog` modal appears) AND the watchdog did NOT itself change the device (selected device id unchanged until the user picks one). Confirm only ONE silent-mic banner was ever shown (no double-warn from B2a's one-shot + the watchdog).
- **Screenshot to capture:** the device picker open after the click; the single banner before the click.

### M-8 — Lifecycle: no leaked watchdog after leaving (AC-B7) — MANUAL-PENDING
- **Given** the host is in-call with the watchdog running, then leaves the call (Leave button).
- **Expect:** the watchdog interval is cleared (no further `getOutboundAudioSource()` polls in console/network), the banner is gone, and rejoining re-arms a fresh watchdog; the interval count does not grow per leave/rejoin cycle.
- **Screenshot/console to capture:** console showing no post-leave watchdog polls + a clean rejoin.

---

## 6. Out of Scope (not tested here)

B2a's capture-side fix (constraints, extractor, recovery decision — gated @ b8fa5f7) is NOT re-opened. Also out of scope: B2c multi-device automatic fallback (NS11/R10), B3 diagnostics on/off toggle, B4 attribution/remote-audio, B5 self-test fidelity, B6 back-to-rooms, SFU/transport/auth, and the pre-existing lobby `AnalyserNode` preview meter (must not regress; not re-tested). The pre-existing unrelated `sfu-client.spec.ts` failure (noted in B1/B2a) is not touched — only `mic-capture-health.spec.ts` + `mic-energy.spec.ts` are required and both are green.

---

## Summary

| Category | Count | Result |
|----------|-------|--------|
| Unit assertions — B2b (`mic-capture-health.spec.ts`, U-20..U-27 + exhaustive 3×2×2 reducer truth table) | 8 scenarios + 12-combo table | ALL PASS (EXIT=0) |
| Unit regression — B1/B2a (`mic-energy.spec.ts`) | green | PASS (no regression) |
| Structural / static (S-1..S-6) | 6 | ALL PASS |
| Backend build | — | PASS (EXIT=0) |
| Frontend build | — | PASS (EXIT=0; only pre-existing warnings) |
| App-render smoke (best-effort, not a gate) | — | renders, 0 console errors |
| Manual live banner (M-4..M-8) | 5 | MANUAL-PENDING (NS5 — not faked, not claimed) |

All deterministic checks pass: the pure-function unit suite is fully green (incl. the AC-B1 exhaustive 3×2×2 reducer truth table, the AC-B2 flat-window⇒silent⇒banner + energy-rose⇒working⇒no-banner cases, the AC-B3 auto-clear sequence, and the AC-B4 mute gating), all 6 structural checks hold (watchdog WARN-only with zero device-mutation calls; own ~1s interval started at publish adjacent to the diagnostics logger and cleared+nulled in cleanupCall; banner exact-text + `Switch microphone`→`openInCallDeviceDialog` + `role="status"` non-modal; old `deviceFailureNotice` silent-mic copy removed; single `micSilentWarning` surface; no new AudioContext/meter), and both builds are green. B1/B2a are not regressed. The live silent-mic banner path (M-4..M-8) is carried as MANUAL-PENDING for JROM's USER seat per NS5 and is deterministically backed by the unit suite.

---

## Verdict: PASS

Unit suite fully green (AC-B1 truth table + AC-B2/B3/B4 window cases, EXIT=0) AND all 6 structural checks hold AND both builds green, with M-4..M-8 explicitly carried as MANUAL-PENDING (not faked, not claimed). Matches the accepted B1/B2a evidence pattern.

---

STATUS: DONE
