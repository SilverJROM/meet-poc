# Test Report — B1: Local Mic-Energy Metric in Diagnostics (R1)

**Batch:** B1  
**Requirement:** R1 — populate `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` on every diagnostic sample for all clients  
**Branch:** `feat/meet-diagnostics-audio-20260529`  
**Commit (HEAD):** `3c1ebff`  
**Tested Against:** unit — localhost (node-assert, headless); live path — MANUAL-PENDING on http://localhost:4700  
**Date:** 2026-05-30  
**QA:** [qa] Mode 2 — Testing

---

## Build Evidence

Dev confirmed in `validation/B1/changes.md §Verification`:

- **Backend build:** `tsc -p tsconfig.json` → `BACKEND_EXIT=0`
- **Frontend build:** `ng build` → `Application bundle generation complete [3.346 s]` → `FRONTEND_EXIT=0`
- Pre-existing warnings only (DatePipe, Stencil glob, @mediapipe CommonJS); no new warnings introduced.

---

## 1. Unit Test Results

**Command:**
```
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/mic-energy.spec.ts
```

**Exact stdout:**
```
mic-energy: all assertions passed
```

**Exit code:** `0`

Terminal output saved to: `validation/B1/unit-test-output.txt`

### Coverage Table

| Scenario | Spec File:Line | Input | Expected | Actual (from run) | Result |
|----------|---------------|-------|----------|-------------------|--------|
| SC-1 / TT-A — active mic, audible signal | `mic-energy.spec.ts:6-14` | `audioLevel:0.42, totalAudioEnergy:12.7, hasLiveTrack:true, micEnabled:true` | `outboundAudioLevel=0.42, outboundAudioEnergy=12.7, micSilent=false` | All three assertions passed (stdout confirms) | PASS |
| SC-2 / TT-C — track disabled (muted) | `mic-energy.spec.ts:18-27` | `audioLevel:0.0, totalAudioEnergy:0.0, hasLiveTrack:true, micEnabled:false` | `micSilent=true, outboundAudioLevel=0 (not null, ≤0.01)` | All four assertions passed | PASS |
| SC-3 / TT-B — enabled, near-zero energy | `mic-energy.spec.ts:31-39` | `audioLevel:0.005, totalAudioEnergy:0.0002, hasLiveTrack:true, micEnabled:true` | `micSilent=true, outboundAudioLevel=0.005, outboundAudioEnergy=0.0002` | All three assertions passed | PASS |
| SC-4 / TT-E — no live audio track | `mic-energy.spec.ts:43-49` | `audioSource:null, hasLiveTrack:false, micEnabled:false` | no throw; `outboundAudioLevel=null, outboundAudioEnergy=null, micSilent=null` | All four assertions passed (doesNotThrow + 3 strict nulls) | PASS |
| TT-D — live+enabled, no media-source stat | `mic-energy.spec.ts:53-61` | `audioSource:null, hasLiveTrack:true, micEnabled:true` | `outboundAudioLevel=null, outboundAudioEnergy=null, micSilent=null` | All three assertions passed | PASS |
| SC-5 — micSilent from instantaneous audioLevel, not totalAudioEnergy | `mic-energy.spec.ts:65-77` | InputA: `audioLevel:0.5, totalAudioEnergy:0`; InputB: `audioLevel:0.005, totalAudioEnergy:9999` | InputA→`micSilent=false`; InputB→`micSilent=true` | Both assertions passed | PASS |
| (extra) Partial stats — audioLevel null | `mic-energy.spec.ts:81-89` | `audioSource:{audioLevel:null, totalAudioEnergy:null}, hasLiveTrack:true, micEnabled:true` | `outboundAudioLevel=null, outboundAudioEnergy=null, micSilent=null` | All three assertions passed | PASS |
| (extra) Threshold constant sanity | `mic-energy.spec.ts:92-94` | — | `MIC_SILENCE_LEVEL_THRESHOLD === 0.01` | Assertion passed | PASS |

**Unit summary: 8/8 assertion blocks passed.**

---

## 2. Structural Checks

### SC-I1 — Exactly one `pc.getStats()` in `collectDiagnostics()`; media-source/audio captured in its own loop

**Grep command:**
```
grep -n "getStats\|media-source" frontend/src/app/services/sfu-client.service.ts
```

**Result:**
```
182:  getStats(): Promise<RTCStatsReport | null> {
183:    return this.pc ? this.pc.getStats() : Promise.resolve(null);
195:      stats = await pc.getStats();
309:      stats = await pc.getStats();
338:    // iteration order is NOT spec-guaranteed — folding the media-source capture into
341:      if (stat.type === 'media-source' && (stat as any).kind === 'audio') {
```

**Analysis:**
- Line 183: the `getStats()` wrapper method — not `collectDiagnostics()`.
- Line 195: inside `collectConnectionQuality()` (a separate method, confirmed at line 186 header) — not `collectDiagnostics()`.
- Line 309: the single `pc.getStats()` call inside `collectDiagnostics()`.
- Lines 338–341: the dedicated `media-source`/audio loop (separate from the candidate-pair loop at line 351) iterates over the SAME already-fetched `stats` report from line 309; no second `getStats()` call exists within `collectDiagnostics()`.

**Verdict:** PASS — exactly one `getStats()` in `collectDiagnostics()`; `media-source`/audio is captured in its own dedicated loop over that single report (`sfu-client.service.ts:340-348`).

---

### SC-I2 — `buildDiagnosticsPayload()` derives audio fields from `deriveOutboundAudioFields`, not hardcoded null

**Grep command:**
```
grep -n "outboundAudioLevel\|micSilent\|deriveOutboundAudioFields\|outboundAudioEnergy" \
  frontend/src/app/pages/room/room.page.ts
```

**Result:**
```
22:import { deriveOutboundAudioFields } from '../../services/mic-energy';
2431:    const micFields = deriveOutboundAudioFields({
2450:      outboundAudioLevel: micFields.outboundAudioLevel,
2451:      outboundAudioEnergy: micFields.outboundAudioEnergy,
2452:      micSilent: micFields.micSilent,
```

**Analysis:**
- `deriveOutboundAudioFields` imported at line 22.
- `buildDiagnosticsPayload()` calls it at line 2431, passing `sfuDiagnostics?.outboundAudioSource`, `hasLiveAudioTrack`, and `micEnabled` derived from real track state.
- Lines 2450-2452: three previously-null fields now read from `micFields` — no literal `null` assignment remains.
- Previously hardcoded nulls at lines 2443-2445 (per changes.md root-cause analysis) are gone.

**Verdict:** PASS — `room.page.ts:2431-2452` wires the three fields through `deriveOutboundAudioFields`; no hardcoded nulls remain.

---

### SC-6 — Zero `AudioContext`/`AnalyserNode` in `mic-energy.ts`

**Grep command:**
```
grep -n "AudioContext\|AnalyserNode" frontend/src/app/services/mic-energy.ts
```

**Result:** _(no output — zero matches)_

**Verdict:** PASS — `mic-energy.ts` contains no `AudioContext`, `AnalyserNode`, or Web Audio API references.

---

### Structural Checks Summary

| Check | File:Line evidence | Verdict |
|-------|-------------------|---------|
| SC-I1: one `getStats()` in `collectDiagnostics()` | `sfu-client.service.ts:309` (single call); `sfu-client.service.ts:340-348` (dedicated media-source loop) | PASS |
| SC-I1: `media-source`/audio captured in own loop | `sfu-client.service.ts:341` — `if (stat.type === 'media-source' && kind === 'audio')` | PASS |
| SC-I2: `buildDiagnosticsPayload` derives from helper, not hardcoded null | `room.page.ts:22` (import), `2431` (call), `2450-2452` (fields from `micFields`) | PASS |
| SC-6: zero AudioContext/AnalyserNode in `mic-energy.ts` | `grep` → no matches | PASS |

**Structural summary: 4/4 passed.**

---

## 3. Manual Live Path (SM-1..SM-3)

> **Status: MANUAL-PENDING** — These scenarios require a real microphone; headless browsers cannot capture live audio energy (project north-star NS5 constraint). They are deterministically backed by the unit tests above. The procedure below is provided for the human/projcore validator.

**Preconditions:**
1. `cd /home/agjrom/websites/meet-poc/frontend && npm start` (or `ng serve --port 4700`)  
2. Wait for "Application bundle generation complete" / "Development server started on http://localhost:4700"
3. Open **two browser sessions**: host in a normal window, guest in a separate incognito window (both navigated to http://localhost:4700)
4. Real microphone permission must be granted in both sessions

**Where to read results:** Navigate to the Diagnostics view (`/diagnostics` route, rendered by `diagnostics.page.ts`) — or inspect the most-recent `sample` row in the backend diagnostics log. Look for the fields `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` in the payload.

---

### SM-1 — Active-mic sample shows live signal (AC1, AC3) — MANUAL-PENDING

**Procedure:**
1. Host joins a room (e.g. "test-room-b1"); guest joins the same room.
2. Host's microphone is unmuted; host speaks continuously (count aloud, say a sentence repeatedly).
3. Wait ~8 seconds (one `DIAGNOSTICS_LOG_INTERVAL_MS = 7500 ms` cadence).
4. In the diagnostics view, locate the most-recent `sample` row for the **host** client.

**Expected (host):**
- `outboundAudioLevel` is a **number > 0** (not `null`, not `0.000`)
- `outboundAudioEnergy` is a **number ≥ 0** (not `null`)
- `micSilent` is **`false`**

5. Locate the most-recent `sample` row for the **guest** client (AC3 — not gated on host role).

**Expected (guest):** same as host — `outboundAudioLevel > 0`, `micSilent: false` when the guest's mic is active and picking up audio.

**Screenshot:** capture the diagnostics panel showing both host and guest sample rows with the three field values visible.

---

### SM-2 — Muted-mic sample shows micSilent:true then flips back (AC2) — MANUAL-PENDING

**Procedure:**
1. In the active two-client room from SM-1, host **mutes** their mic (click the mute button — this sets `track.enabled = false`).
2. Wait ~8 seconds for the next diagnostics sample.
3. In the diagnostics view, locate the host's new `sample` row.

**Expected (muted state):**
- `micSilent` is **`true`**
- `outboundAudioLevel` is **`0` or ≤ 0.01**

4. Host **unmutes** and speaks.
5. Wait another ~8 seconds for the following sample.

**Expected (unmuted state):**
- `micSilent` flips back to **`false`**
- `outboundAudioLevel` is **> 0**

**Screenshot:** before (muted) and after (unmuted) sample rows side-by-side.

---

### SM-3 — No additional AudioContext in DevTools (AC6, runtime verification) — MANUAL-PENDING

**Procedure:**
1. **Before joining** a room: open Chrome DevTools → Application tab or use the browser console:
   ```js
   // baseline count (should be 0 or 1 for the lobby preview meter)
   ```
   Alternatively, open DevTools → Performance → check "Web Audio" events to get a baseline AudioContext count.
2. **Join the room** with the host. Mic becomes active.
3. Wait ~10 seconds for the in-call diagnostics loop to run at least once.
4. Return to DevTools and check AudioContext count again.

**Expected:**
- AudioContext count is **≤ 1** (the pre-existing lobby `AnalyserNode` preview meter created by `media.service startMicLevel/getMicLevel`).
- No new AudioContext was created by `mic-energy.ts` (it uses only `RTCStatsReport` values, no Web Audio API).
- Count is **not 2+**.

**Screenshot:** DevTools console or Performance → Web Audio section, showing AudioContext count before and after joining.

---

## Summary

| Category | Count | Result |
|----------|-------|--------|
| Unit assertions (SC-1, SC-2, SC-3, SC-4, TT-D, SC-5 + 2 extra) | 8/8 | ALL PASS |
| Structural checks (SC-I1 ×2, SC-I2, SC-6) | 4/4 | ALL PASS |
| Manual smoke (SM-1, SM-2, SM-3) | 3 | MANUAL-PENDING |

All deterministic checks (unit + structural) pass. The live-path scenarios (SM-1..SM-3) require a real microphone and are pending human validation on http://localhost:4700.

---

## Verdict: PASS

All unit tests and structural checks pass at commit `3c1ebff`. The pure helper `deriveOutboundAudioFields` is correctly wired through `collectDiagnostics()` → `buildDiagnosticsPayload()`. No AudioContext is introduced. The three previously-null fields (`outboundAudioLevel`, `outboundAudioEnergy`, `micSilent`) now derive from real stats. Manual smoke scenarios are MANUAL-PENDING (cannot be faked headless per NS5).

---

STATUS: DONE
