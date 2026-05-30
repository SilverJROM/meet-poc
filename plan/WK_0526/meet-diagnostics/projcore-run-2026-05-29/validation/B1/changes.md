# Changes — B1: Local mic-energy metric in diagnostics (R1)

**Branch:** `feat/meet-diagnostics-audio-20260529`
**Commits:** `706813d` (feature) + `3c1ebff` (REVISE-1 fix: separate media-source loop — see §Caveats)
**Lifecycle:** post-live, Deferral OFF (no TODO/FIXME, no shims — slice finished).

---

## User Report (verbatim — og-requirements R1)

> "R1 — Local mic-energy metric populated on ALL clients (host + guests). Every diagnostic `sample` must carry real, non-null `outboundAudioLevel`, `outboundAudioEnergy`, and `micSilent`. (Today: null in 100% of samples.) This is the source-side signal that proves whether a participant's mic is actually capturing audio."

---

## Root Cause (mechanism-level)

Two-part mechanism, both confirmed in source:

1. **Hardcoded nulls at the payload site.** `buildDiagnosticsPayload()` (`frontend/src/app/pages/room/room.page.ts`, formerly lines 2443-2445) literally assigned `outboundAudioLevel: null, outboundAudioEnergy: null, micSilent: null`. These three fields were never derived from any signal anywhere → null in 1561/1561 samples.

2. **The producing signal was never read.** `SfuClientService.collectDiagnostics()` (`frontend/src/app/services/sfu-client.service.ts:285`) performs ONE `pc.getStats()` pass (line ~308/309) and iterates `candidate-pair`, `outbound-rtp`, and `inbound-rtp` stats — but never the `media-source` (kind `audio`) stat that carries `RTCAudioSourceStats.audioLevel` / `totalAudioEnergy`. The source-side instantaneous mic level was available in the same stats report but discarded.

Fix: read the `media-source`/audio stat in the existing single pass, carry it on the snapshot, and derive the three fields from it (plus local-track ground truth) via a pure helper.

---

## Code Changes (per file — WHAT + WHY)

### 1. `frontend/src/app/services/meeting-sessions.service.ts`
- **WHAT:** Added an OPTIONAL field to `SfuDiagnosticsSnapshot`:
  `outboundAudioSource?: { audioLevel: number | null; totalAudioEnergy: number | null } | null;`
- **WHY:** Transport channel for the source-side stat from `collectDiagnostics()` → `buildDiagnosticsPayload()`. Optional for back-compat with any in-flight snapshot shape.

### 2. `frontend/src/app/services/sfu-client.service.ts`
- **WHAT:** In `collectDiagnostics()`, declared `let outboundAudioSource … = null;` before the stat loops and read the `media-source`/`kind==='audio'` stat in its OWN dedicated `for (const stat of stats.values())` loop (over the SAME single already-fetched `stats` report — still exactly ONE `getStats()` call), placed right before the candidate-pair loop and matching the file's per-stat-type loop convention (outbound-rtp / inbound-rtp are already separate loops). That loop `break`s on the first audio media-source (the local mic source). Extracts `audioLevel`/`totalAudioEnergy` with `typeof === 'number'` guards (else null). Added `outboundAudioSource` to the SUCCESS return and `outboundAudioSource: null` to BOTH early returns (the `!pc || !publishState` return and the `getStats()`-catch return) so the field is always present.
- **WHY:** Surfaces the unread source-side stat. The dedicated loop is the REVISE-1 fix: the original 706813d folded the media-source branch into the candidate-pair loop, which `break`s on the first nominated/succeeded pair — and since RTCStatsReport iteration order is NOT spec-guaranteed, browsers that iterate the candidate-pair first would `break` before the media-source stat and leave `outboundAudioSource` null (silent R1 regression). Separate loop closes that hazard. Guards handle browsers/partial reports that omit the fields. Always-present field keeps the snapshot shape uniform across success and failure paths.

### 3. `frontend/src/app/services/mic-energy.ts` (NEW — pure module)
- **WHAT:** Framework-free module. Exports `OutboundAudioSourceStat`, `DeriveOutboundAudioInput`, `OutboundAudioFields`, `MIC_SILENCE_LEVEL_THRESHOLD = 0.01`, and `deriveOutboundAudioFields(input)`. Implements the resolved truth table exactly:
  - **TT-E** `!hasLiveAudioTrack` → all null (nothing to measure).
  - **TT-C** live && `!micEnabled` (muted) → level/energy passed through from source (or null), `micSilent: true` (known-silent from track state).
  - **TT-D** live && enabled && no source → all null (graceful absence; browser lacks media-source audio stats — not a silence claim).
  - **TT-A/B** live && enabled && source → raw level/energy; `micSilent = audioLevel < 0.01` when `audioLevel` is a number, else `null` (partial-stats pass-through).
- **WHY:** Isolates the derivation (Isolation > DRY) so it's unit-testable with zero browser/Angular deps. `micSilent` is driven by INSTANTANEOUS `audioLevel`, never cumulative `totalAudioEnergy`. No Angular, DOM, AudioContext, or Web Audio import.

### 4. `frontend/src/app/pages/room/room.page.ts`
- **WHAT:** Imported `deriveOutboundAudioFields` from `../../services/mic-energy`. In `buildDiagnosticsPayload()`, reads the local audio track GROUND TRUTH (`this.media.localStream()?.getAudioTracks()[0]`), computes `micFields` via `deriveOutboundAudioFields({ audioSource: sfuDiagnostics?.outboundAudioSource ?? null, hasLiveAudioTrack: !!track && track.readyState === 'live', micEnabled: track?.enabled ?? false })`, and replaced the three hardcoded nulls with `micFields.outboundAudioLevel/outboundAudioEnergy/micSilent`.
- **WHY:** Removes the hardcoded nulls (the bug). Uses real track state (`readyState`/`enabled`), not the `micOn()` UI signal, so the metric reflects the actual capture path.

### 5. `frontend/src/app/services/mic-energy.spec.ts` (NEW — node-assert test)
- **WHAT:** Mirrors `sfu-client.spec.ts` style (`node:assert/strict`, top-level assertion blocks, final `console.log`). Covers SC-1/TT-A, SC-2/TT-C, SC-3/TT-B, SC-4/TT-E (with `assert.doesNotThrow`), TT-D graceful absence, SC-5 instantaneous-not-cumulative (both directions), partial-stats (`audioLevel:null` → `micSilent:null`), and the threshold constant.
- **WHY:** Primary proof for a feature with no UI repro — the truth table is fully exercised.

---

## Commits

| Hash | Subject |
|------|---------|
| `706813d` | feat(diagnostics): populate outboundAudioLevel/Energy/micSilent from media-source stats (R1) |
| `3c1ebff` | fix(diagnostics): read media-source audio stat in its own loop so candidate-pair break can't skip it (R1) |

`706813d` staged ONLY the five changed files (no `git add -A`). REVISE-1 commit `3c1ebff` staged ONLY `frontend/src/app/services/sfu-client.service.ts` (the single file this iteration touches); the carried-over modified `plan/WK_0526/list/...` and untracked junk were intentionally excluded. Committed on top — no amend/rebase/merge.

---

## Standing Rules

None introduced.

---

## Verification

### Backend build — PASS
```
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
BACKEND_EXIT=0
```

### Frontend build — PASS
```
Application bundle generation complete. [3.346 seconds] - 2026-05-30T00:10:46.696Z
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
FRONTEND_EXIT=0
```
Warnings present (DatePipe unused in RoomsPage; Stencil glob; @mediapipe CommonJS) are all PRE-EXISTING and unrelated to this change.

### Unit test — PASS
```
$ cd frontend && npx tsx src/app/services/mic-energy.spec.ts
mic-energy: all assertions passed
EXIT=0
```

### SC-6 static check — PASS
`grep -n "AudioContext\|AnalyserNode" frontend/src/app/services/mic-energy.ts` → zero matches. No `new AudioContext`, no Web Audio import.

### SC-I1 structural check — PASS
Exactly one `pc.getStats()` call inside `collectDiagnostics()` (line ~309). The `media-source`/`kind==='audio'` capture now lives in its OWN dedicated loop over that same single `stats` report (REVISE-1) — no second `getStats()` was added. (Other `getStats` references at lines 183 and 195 are in separate pre-existing methods, not `collectDiagnostics`.)

### Manual localhost:4700 path (expected)
- Two clients in a room; host unmuted and speaking → after one `DIAGNOSTICS_LOG_INTERVAL_MS` (7.5s) cadence the host `sample` shows `outboundAudioLevel > 0`, `outboundAudioEnergy ≥ 0`, `micSilent: false`. Same for the guest (not gated on host role — AC3).
- Host mutes (`track.enabled = false`) → next sample `micSilent: true`, `outboundAudioLevel` 0/near-zero (≤ 0.01). Unmute + speak → `micSilent` flips back to `false`, level > 0.

---

## Bug Reproductions

N/A — this is a FEATURE (wiring an unpopulated field), not a UI bug. Proof is the unit test + both builds + the manual path above.

---

## Caveats

- **REGRESSION introduced-then-fixed within the batch (REVISE-1, `3c1ebff`):** the original feature commit `706813d` placed the `media-source`/audio capture INSIDE the candidate-pair `for` loop, which `break`s on the first nominated/succeeded candidate-pair. Because RTCStatsReport iteration order is NOT spec-guaranteed, a browser iterating the candidate-pair before the audio media-source stat would `break` early, leave `outboundAudioSource` null, and silently regress R1 to all-null on those browsers. Caught in review; fixed by hoisting the media-source capture into its OWN dedicated loop over the same single `stats` report (no second `getStats()` call). Defect was contained to this batch and never shipped.
- **PRE-EXISTING:** `frontend/src/app/services/sfu-client.spec.ts` has an unrelated failure (~line 89, per brief). Not touched; only the new `mic-energy.spec.ts` is required to pass and does.
- **Graceful absence (by design):** browsers that don't expose `media-source` audio stats yield `outboundAudioSource = null` → TT-D returns all-null. This is correct "missing data is a state" behavior, not a silence claim.
- **Call-start transient (by design):** the first sample or two after the call starts may read `micSilent: true` before `audioLevel` populates. B2's silent-mic warning debounces this; B1 reports per-sample raw truth and does not debounce.
- **Resolved semantics:** no-live-track → `null` (nothing to measure) vs muted-but-live → `true` (known-silent from `track.enabled`). Distinguished deliberately so downstream B2/B4 can tell "no mic" from "mic muted."
- **Out of scope (not touched):** B2 warning UI, B3 toggle, B4 attribution/view, SFU/transport, room layout, and the lobby `AnalyserNode` preview meter (`media.service` `startMicLevel`/`getMicLevel`) — all left alone.

---

**STATUS: DONE**
