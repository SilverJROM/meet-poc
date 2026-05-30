# B5 Independent Validation — R8 device self-test fidelity (no false pass)

**Validator**: independent batch validator (fresh eyes). Did NOT read scenarios / review / implementation plan.
**Repo**: /home/agjrom/websites/meet-poc @ `feat/meet-diagnostics-audio-20260529` / `2c062ff` (B5 on top of `4a50da2`).
**Requirement (R8)**: the pre-call mic check must measure the SAME capture path the call publishes (same device, same constraints, same published-audio-level signal as R1), so a mic that will NOT transmit cannot show "working"; sustained no-energy ⇒ "No sound detected from <device> — pick another" + warn before join; pre-call result must match in-call reality.

---

## Check-by-check (cite file:line)

### 1. SAME-VERDICT-AS-IN-CALL (the crux) — PASS
The lobby poller uses the EXACT shared functions, not a shadow copy or a second threshold.
- Lobby poller `pollLobbySelfTest` calls `classifyMicCapture(this.media.getMicCaptureWindow())` and `nextMicWarningState(this.lobbySelfTestFlag(), cls, micActive)` — `room.page.ts:2665-2666`.
- The in-call continuous watchdog `pollMicSilenceWatchdog` calls the SAME `classifyMicCapture(this.micSilenceWindow)` — `room.page.ts:2617` — and the SAME `nextMicWarningState` — `room.page.ts:2603,2629`.
- The in-call initial gate `verifyInitialCaptureEnergy` calls the SAME `classifyMicCapture(samples)` — `room.page.ts:2316`.
- All three import from the one module: `classifyMicCapture` / `nextMicWarningState` at `room.page.ts:23,25`. There is exactly ONE definition of each, in `mic-energy.ts:134` and `mic-energy.ts:181`.
- The silence threshold is the single `MIC_SILENCE_LEVEL_THRESHOLD = 0.01` at `mic-energy.ts:29`, applied inside `classifyMicCapture` as the default `levelThreshold` (`mic-energy.ts:139,157`). The lobby poller passes NO `opts` override (`room.page.ts:2665`), so it inherits 0.01 verbatim. No looser/second threshold exists.
Verdict: the lobby verdict is byte-for-byte the in-call verdict logic. The R8 "shadow copy reopens the bug" risk is closed.

### 2. SUSTAINED, NOT ONE-FRAME; RAW RMS not ×3 — PASS
- The verdict is over a WINDOW: the poller passes `media.getMicCaptureWindow()` (a bounded rolling `EnergySample[]`), never a single sample. `classifyMicCapture` returns `'indeterminate'` for `<2` usable energy samples (`mic-energy.ts:146`) — a one-frame window can never produce 'silent'.
- The window is built off the cumulative accumulator: `accumulateEnergyFrame(prevTotal, meanSquare)` → `{ totalAudioEnergy: prevTotal+meanSquare, audioLevel: sqrt(meanSquare) }` (`mic-energy.ts:106-112`), pushed into `micCaptureWindow` capped at `MIC_CAPTURE_WINDOW_CAP=24` (~3s @125ms) with `.shift()` over cap — `media.service.ts:217-220`, cap constant `media.service.ts:9`.
- The window's `audioLevel` is RAW RMS: `sqrt(meanSquare)` (`mic-energy.ts:110`). The ×3 is applied ONLY to the display signal `micLevel.set(... sqrt(meanSquare) * 3)` at `media.service.ts:221`, computed from the SAME `meanSquare` but never fed back into the window. So the 0.01 corroboration sees un-scaled RMS — same units as the in-call media-source `audioLevel` (which is read raw at `room.page.ts:2612`). No ×3 mis-calibration.

### 3. NO NEW METER — PASS
`git diff 4a50da2 2c062ff -- frontend/src/app/services/media.service.ts` adds ZERO `createAnalyser` / `new AudioContext` / `webkitAudioContext`. The single existing `analyser = this.audioContext.createAnalyser()` (`media.service.ts:199`) is unchanged; B5 only inserts the `meanSquare`/`accumulateEnergyFrame`/window lines INSIDE the existing `setInterval` (`media.service.ts:212-220`). The energy is read off the SAME AnalyserNode that already drives `micLevel`. Single-analyser invariant holds.

### 4. QUIET-BUT-WORKING NOT FLAGGED (U-8 invariant) — PASS
`classifyMicCapture` is energy-delta-PRIMARY: if `energies.last - energies.first >= epsilon` it returns `'working'` BEFORE ever looking at the level (`mic-energy.ts:148-149`). The level/0.01 check is reached ONLY when energy is flat (`mic-energy.ts:151-157`). So a mic with rising cumulative energy but every instantaneous level sub-0.01 classifies 'working' — never flagged.
Unit proof: `mic-selftest.spec.ts` U-2 builds a 5-frame window from `accumulateEnergyFrame(_,4e-6)`, asserts strictly-increasing cumulative AND every `audioLevel ≈ 2e-3 < 0.01` (`mic-selftest.spec.ts:52-64`); U-4 asserts `classifyMicCapture(risingWindow) === 'working'` for a rising window whose levels are all ≤0.002 (`mic-selftest.spec.ts:95-100`). These are REAL assertions on the production `classifyMicCapture` output.

### 5. NON-BLOCKING + BOTH SURFACES — PASS
- BOTH lobby surfaces render the copy-locked string `No sound detected from {{ micTestDeviceLabel() }} — pick another`:
  - lobby-preview: `lobby-preview.component.html:49-51` (gated on `micTestFlagged()`).
  - lobby device-dialog: `device-dialog.component.html:54-55` (gated on `micTestFlagged() && mode() === 'lobby'`).
- Both fed by the ONE signal: `[micTestFlagged]="lobbySelfTestFlag()"` on `app-lobby-preview` (`room.page.html:420`) and on the LOBBY `app-device-dialog` (mode="lobby", block at `room.page.html:515-534`). The IN-CALL `app-device-dialog` (mode="in-call", `room.page.html:157,159`) receives NO `micTestFlagged` input and the template flag is mode-gated off — correctly excluded.
- Join button NOT disabled by the flag: the submit button at `room.page.html:498-502` has `[disabled]="state() === 'connecting'"` only. `grep` shows `lobbySelfTestFlag`/`micTestFlagged` appear ONLY as the 2 input bindings (room.page.html:420,533) — never in any `[disabled]`. Non-blocking confirmed.

### 6. RE-RAN THE PROOF MYSELF (fresh) — PASS
```
$ cd frontend && npx tsx src/app/services/mic-selftest.spec.ts   → mic-selftest: all assertions passed  (EXIT 0)
$ npx tsx src/app/services/mic-energy.spec.ts                    → mic-energy: all assertions passed     (EXIT 0)
$ npx tsx src/app/services/mic-capture-health.spec.ts            → mic-capture-health: all assertions passed (EXIT 0)
```
The new spec's assertions are REAL (not theater): they call the production `accumulateEnergyFrame`, `classifyMicCapture`, `nextMicWarningState`, `audioCaptureConstraints` from `./mic-energy.js` (`mic-selftest.spec.ts:2-10`) and assert on their actual return values. No `page.setContent`, no static-string assertion, no hand-rolled copy of the classifier. Specifically exercised:
- silent flat-energy window ⇒ flag: U-3 asserts `classifyMicCapture(silentWindow)==='silent'` (flat cumulative=5, levels ≤0.002) AND `nextMicWarningState(false,'silent',true)===true` (`mic-selftest.spec.ts:76-82`). Threshold boundary asserted: same flat energy with one level 0.02 ⇒ `'working'` (`mic-selftest.spec.ts:85-90`) — proving the 0.01 cut is the in-call cut.
- rising-energy quiet window ⇒ no flag: U-4 (`mic-selftest.spec.ts:95-103`) incl. clear-on-fix `nextMicWarningState(true,'working',true)===false`.
- thin window ⇒ hold: U-6 asserts single-sample/0-usable ⇒ `'indeterminate'` and `nextMicWarningState` holds current (`mic-selftest.spec.ts:113-125`).
- constraint deep-equal parity: U-8 `assert.deepStrictEqual(audioCaptureConstraints(true,'dev-x'), {...exact:'dev-x'...})` and never `{exact:''}` (`mic-selftest.spec.ts:130-149`) — the SAME builder the call path uses (`media.service.ts:383`).

### 7. ADVERSARIAL — one real-device hole, MANUAL-PENDING (not a logic defect)
Searched for a path where a mic that publishes silence on the call shows NO lobby flag:
- Window-never-fills: handled — `<2` usable samples ⇒ 'indeterminate' ⇒ no flag, but also no false PASS (the meter just shows nothing). The pre-call test can't claim "working"; consistent with R8 (a false PASS is the sin, an honest "not yet measured" is not).
- Poller-never-runs: poller is started at `startLobbyPreflight` (`room.page.ts:1785`), `reacquireLobbyStream` (`room.page.ts:1815`), and `enableMicPreview` after AudioContext activation (`room.page.ts:884-885`); gated to `state()==='lobby' && media.audioContextActivated()` and self-stops otherwise (`room.page.ts:2656-2658`). On desktop the context activates with the preview; on mobile it is behind "Tap to enable mic preview" — until tapped, no meter and no verdict (honest, not a false pass).
- ×3 hiding silence: ruled out — window uses raw RMS (check 2).
- Wrong-signal: ruled out — same classifier+threshold+reducer (check 1).
- **THE ONE REAL HOLE (manual-only):** `accumulateEnergyFrame` treats `meanSquare > 0` as energy (`mic-energy.ts:107`); `totalAudioEnergy` is a monotone running SUM. A truly-dead mic that nonetheless feeds the AnalyserNode the slightest non-zero dither / DC offset (byte ≠ exactly 128) produces a tiny positive mean-square every frame, so the 24-sample cumulative delta can exceed `ENERGY_DELTA_EPSILON=1e-7` and classify `'working'` even though the published `audioLevel` would be silent on the call. The in-call watchdog does NOT have this exposure because it reads the browser's media-source `totalAudioEnergy` (which a silent encoder leaves flat), whereas the lobby reads a locally-accumulated AnalyserNode sum. This means the lobby flag's robustness against a "ghost-energy" dead mic is **proven-by-logic only for an exactly-zero capture**; the real-device dead-mic case (M-1) genuinely depends on the hardware producing flat AnalyserNode frames and CANNOT be proven headless (Chrome fake-media tones every input — NS5). This is correctly declared MANUAL-PENDING (M-1/M-2/M-3) in changes.md, and it is a real-device fidelity caveat, not a label/test mismatch.

---

## Proven-by-logic vs pending-USER-seat
- PROVEN by logic + green specs: lobby uses the IN-CALL classifier+threshold+reducer (no shadow copy / no second threshold); sustained-window not one-frame; raw RMS not ×3; no new meter/context; quiet-but-working never flagged; copy in BOTH surfaces; Join not disabled.
- PENDING USER seat (real device, localhost:4700): a real dead mic actually shows the flag before join (M-1); a real working mic shows no flag AND transmits (M-2); switch silent→working clears within ~one window (M-3). Plus the "ghost-energy dead mic" edge above — only a live device can confirm flat AnalyserNode frames. These are honest fidelity caveats; none is a test/label inconsistency.

## Regression
None observed. The diff only ADDS the accumulator + window + lobby poller + flag inputs; in-call B2a/B2b/B2c paths and the in-call device-dialog are untouched. All 3 existing specs re-ran green.

---

STATUS: PASS — Lobby self-test reuses the EXACT in-call `classifyMicCapture` (mic-energy.ts:134) + `nextMicWarningState` (mic-energy.ts:181) + `MIC_SILENCE_LEVEL_THRESHOLD=0.01` (mic-energy.ts:29) over a sustained 24-sample RAW-RMS window built off the SAME AnalyserNode (media.service.ts:199,217-221), no new meter (clean diff), quiet-but-working never flagged (mic-energy.ts:148-149 + spec U-2/U-4), copy in BOTH lobby surfaces (lobby-preview.component.html:50, device-dialog.component.html:55), Join non-blocking (room.page.html:498-500). Re-ran mic-selftest/mic-energy/mic-capture-health specs — all pass with REAL assertions on production functions. Adversarial: one real-device "ghost-energy dead mic" edge (mic-energy.ts:107 cumulative-sum) is proven-by-logic only for exactly-zero capture and correctly carried as MANUAL-PENDING M-1..M-3 (NS5 / fake-media tones every input) — a real-device fidelity caveat, not a test/label mismatch, so it does not block the gate.
