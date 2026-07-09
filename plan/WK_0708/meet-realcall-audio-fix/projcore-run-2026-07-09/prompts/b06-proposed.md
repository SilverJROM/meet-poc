# Batch B06 — Faithful PipeWire weak-source mode

## Proposed Implementation

**STATUS: PROPOSED**

---

## Objective

Test the **real-world weak-source scenario** — a speaker with naturally low input (soft talker, phone with low volume, etc.) via PipeWire device-level attenuation on dev_machine, with `autoGainControl` **left ON** so we observe how Chrome actually compensates in situ. Measure both the intended attenuation (PipeWire input level) and the actual received level after AGC processing. Distinct from B05's forced synthetic shim; this is a faithful reproduction of user behavior.

---

## Grounding (read against current code)

- **B05 vs B06 scope:** B05 (forced shim) attenuated *after* `getUserMedia()` returned, proving our measurement harness works in a controlled synthetic case. B06 attenuates *before* the microphone stream enters Chrome, simulating a real soft-talker input, and lets AGC run naturally to compensate — the opposite control scenario.
- **AGC behavior model:** With weak input at the device level, Chrome's `autoGainControl` (requested as `{ ideal: true }` in `mic-energy.ts`) will detect the low signal and amplify it during playback/transmission. B06 captures the receive-side loudness both with and without this compensation active.
- **Infrastructure:** `RecordingArbiter` + `StimulusVerification` (from B02 / B05) already handle loudness measurement and verdict logic; B06 reuses this without modification.
- **Dev-machine setup:** `project_specs.md` § Playback lists PipeWire attenuation command. B06 does **not** implement the attenuation script itself — it documents the manual setup needed (e.g., `pactl set-source-volume`) or wires an existing helper if available.

---

## Approach

### 1. Test scenario — single weak-source call

- **Setup phase:** Before the call, attenuate the source (dev_machine microphone) to ~60–70% of normal level via PipeWire (or test harness helper if available).
- **Call phase:** One 2–3 minute instrumented call with:
  - dev_machine: weak source (attenuated at PipeWire level), AGC enabled, records own output.
  - remote: normal source, captures the received audio.
  - Fixed-clock scheduler (B03) for turn timing.
- **Measurement phase:** After call, extract receive-side loudness (remote's recording of dev_machine's voice) and compare to a stored reference (either dev_machine's own normal-level transmit, or a prior normal-source call).

### 2. Loudness comparison and logging

- Record `intendedAttenuation` (the PipeWire level setting, e.g., "60% source volume") in test metadata.
- Measure `measuredAttenuation` from the receive-side recording: `loudness(dev_machine at 60%) / loudness(dev_machine normal)` using existing `LoudnessAnalyzer` (B02).
- Measure `agcCompensation` = `measuredAttenuation` with AGC ON / measured without AGC (if run as separate scenario, or inferred from signal inspection).
- Log all three to `validation/b06-changes.md` (or a dedicated `decisions/b06-findings.md`).

### 3. Acceptance: one successful attenuated run

- No synthetic test assertion needed (unlike B05's negative control) — the goal is to *observe* what AGC does in a real scenario.
- Call must complete without error; receive-side recording must be analyzable (valid WAV, >3 sec of audio).
- Loudness analysis must produce a numerical comparison (`measuredAttenuation / intendedAttenuation` ratio, AGC boost factor if measurable).
- No verdict gate (PASS/FAIL) — B06 is observational. Verdict logic is for later batches (B08+ forced-sweep acceptance).

### 4. Dependencies and reuse

- **B02:** `RecordingArbiter` + `LoudnessAnalyzer` for measurement. ✅
- **B05:** `StimulusVerification` interface shape (reuse, no B06 extension).
- **B03:** Fixed-clock scheduler for call orchestration. ✅
- **B04:** `T_gap` baseline (3400ms) for turn timing. ✅

---

## Scope Bounds

- **No app changes:** `media.service.ts` and `mic-energy.ts` are read-only. B06 does not alter AGC settings.
- **No new verdicts or decision logic:** B06 logs findings; later batches (B08+) use these findings to set sweep acceptance criteria.
- **PipeWire setup is manual/documented, not automated:** B06 documents the command or test helper to attenuate the source; actual invocation may be left to JROM's test operator (or a pre-test setup script, if available).

---

## Artifacts

- `e2e/harness/__tests__/b06-weak-source.test.ts` — one call scenario with PipeWire-attenuated source, AGC ON, loudness logging.
- `decisions/b06-findings.md` — numerical loudness comparison (intendedAttenuation, measuredAttenuation, agcCompensation factor, confidence/notes).
- `validation/b06-changes.md` — standard validation report.

---

## Acceptance Criteria (from brief)

- ✅ One attenuated source call completes successfully (no errors, valid recordings on both sides).
- ✅ Receive-side recording analyzed; loudness extracted and compared to reference.
- ✅ Findings logged: `intendedAttenuation` (PipeWire setting) and `measuredAttenuation` (from loudness ratio).
- ✅ AGC compensation observable in logs (e.g., "AGC boost ~+6dB observed" or "no measurable boost").

---

## Notes for Validator (L2) / Redteam (budget)

- Confirm the call scenario uses the **real PipeWire attenuation**, not a synthetic shim — verify the test setup touches `pactl` or equivalent, or documents the operator step.
- Confirm `LoudnessAnalyzer` is called on the receive-side recording, and the ratio is logged numerically (not just "sounds louder").
- Confirm no AGC-disabling changes were made in the diff (AGC must remain ON to see its real compensatory behavior).
- Confirm one clean call run — errors, dropped audio, or analysis failures are reported as BLOCKED (not silently passing).

---

## Effort Estimate

~25 min (per `queue-batches.md` B06 estimate).

---

## Handshake

Awaiting **APPROVED-PLAN** before implementation begins.
