# Code Review: Batch B1 — In-call mic AND camera always enable-able; never stiff

## Verdict: APPROVE

## Diff Summary
`git diff a4c81cc..HEAD -- frontend/` — 4 source files, +315/-14 (plus changes.md):
- **NEW** `services/media-toggle.ts` (+49) — pure `resolveMediaToggleAction({streamExists,trackExists,trackEnabled})` and `permissionBlockHint(kind, err)`; framework-free, no DOM/signals.
- **NEW** `services/media-toggle.spec.ts` (+129) — node:assert/strict spec, S1 steps 1-8 + S2 steps 1-5 + alias/null edges.
- `services/media.service.ts` (+69/-14) — `toggleMic` now async (acquire path mirrors `replaceAudioTrack`); `toggleCamera` acquire branch now covers no-localStream; both branch via `resolveMediaToggleAction`.
- `pages/room/room.page.ts` (+25/-...) — `toggleMic` handler awaits + passes SFU publish cb + deviceId; both handlers clear `actionNotice` on success and route catch to new private `handleInCallMediaPermission`.

## Codex-Template Section Check
User Report ✓ (verbatim brief, changes.md:5-6) — Root Cause ✓ (mechanism, :8-14) — Code Changes ✓ (per-file WHAT+WHY, :16-34) — Verification ✓ (build PASS + tsx specs + commands+results, :43-49) — Caveats ✓ (SOFT/manual layer scoping + no-template-change, :55-57). All five present, in order.

## Scenario Coverage + Brief Anchoring
| Scenario / Brief Field | Addressed | File:Line |
|---|---|---|
| RC#1 mic acquire from off/absent + publish | YES | media.service.ts:231-268 acquire branch → `getUserMedia` + adopt/addTrack + `onAudioTrackChanged` (= `sfuClient.replaceAudioTrack`) + `micOn.set(true)` + `startMicLevel`; wired at room.page.ts:944-947 |
| RC#1 flip-after | YES | media.service.ts:239-243 enable/disable branch flips same track (action-based) |
| RC#2 camera acquire incl. no-localStream + publish | YES | media.service.ts:301-317 acquire covers `!stream` (→ `localStream.set(camStream)`) and stream-without-track (→ `addTrack`); publish via `replaceEffectiveVideoTrack` at room.page.ts:962 |
| RC#2 preserve stream-exists path / flip-after | YES | media.service.ts:294-299 flip branch unchanged behavior, incl. `onVideoTrackChanged(... ? existing : null)` |
| RC#3 never stiff / no dead-end | YES (S1) | media-toggle.ts:30-33 action union has no noop/blocked/denied member; spec S1.8 asserts it (media-toggle.spec.ts:78-89) |
| RC#3 NotAllowedError → non-blocking hint | YES (S2) | media-toggle.ts:46-48; routed at room.page.ts:975-982 `handleInCallMediaPermission` → `actionNotice.set` (CALLED, not dead code — caught at room.page.ts:951,971) |
| RC#3 controls never disabled | YES | No template change; caveat changes.md:57 confirms controls already non-`[disabled]`; diff touches no `.html` |
| RC#4 no regression (device-select, prior fixes) | YES | `replaceAudioTrack`/`replaceVideoTrack`/`muteMic`/`removeAudioTrack`/`toggleScreen` untouched (diff shows none); device-selection + remote-audio-playability specs still green |
| RC#5 unit-provable decision | YES | media-toggle.spec.ts exits 0, "all assertions passed" |

## Code Quality (file:line)
- **Flip semantics preserved (verified equivalent):** original mic `track.enabled = !track.enabled` and camera `existing.enabled = !existing.enabled` are reproduced by `track.enabled = action === 'enable'`. When the track is currently enabled, `resolveMediaToggleAction` returns `'disable'` → `enabled = false`; when disabled → `'enable'` → `enabled = true`. Behaviorally identical to the toggle. (media.service.ts:240-241, 294-295; media-toggle.ts:32)
- **Publish parity (verified):** the mic acquire path (media.service.ts:246-267) mirrors `replaceAudioTrack` (:104-119) step-for-step — `getUserMedia` → `registerDebugTracks` → empty-track stop-guard → addTrack/adopt → `micOn.set(true)` → `await onAudioTrackChanged(track)` → `startMicLevel`. No new publish mechanism; `replaceAudioTrack` on the pre-negotiated `audioSender` (no renegotiation). Camera uses the existing `replaceEffectiveVideoTrack` callback. ✓
- **No-stream creation (verified):** mic `if (!stream) this.localStream.set(nextStream); else stream.addTrack(nextTrack)` (:260-264); camera `if (!stream) this.localStream.set(camStream); else stream.addTrack(track)` (:311-315). Both adopt/create rather than early-return. ✓
- **Single-caller signature change (verified):** `grep '.toggleMic('` → only `room.page.ts:944`, which `await`s and broadcasts the real returned `mic` (room.page.ts:949). `toggleCamera` similarly single-caller at :961. No other caller breaks. ✓
- **permissionBlockHint robustness (verified):** optional-chains `(err as {...})?.name`, returns `null` for null/undefined/non-NotAllowed; never throws; no permanence words (spec asserts `!/disabled|forever/i`). ✓
- **Defensive addition (noted, not a defect):** camera acquire adds a `if (!track) { stop(); return false; }` guard the original lacked. Safe hardening, mirrors `replaceVideoTrack`'s guard; does not alter the success path. (media.service.ts:307-310)

## Convention Conformance
- Spec follows `device-selection.spec.ts` pattern: `node:assert/strict`, `./media-toggle.js` import, braced blocks, final `console.log('media-toggle: all assertions passed')`. ✓
- Pure-fn module is framework-free as intended; default async no-op param keeps `toggleMic` callable without a publish cb. ✓
- Standing Rule documented (changes.md:41) and confirmed accurate: spec runs from `frontend/` with full `src/app/services/` path.

## Required Changes
None.

## Concerns
- **SOFT/manual layer outstanding (expected, not blocking):** S3-S5 e2e and S6-S7 manual-localhost evidence are qa's to capture per the scenarios gate summary; the HARD gates (S1, S2, S8 regression specs, S9 build) all land in this batch. This is correctly scoped in Caveats and is not a B1 DONE blocker.

## Gate confirmation (reviewer-run)
- `npx tsx src/app/services/media-toggle.spec.ts` → "media-toggle: all assertions passed", exit 0. ✓
- `npx tsx src/app/services/device-selection.spec.ts` → green; `...remote-audio-playability.spec.ts` → green (S8 prior-fix regression sub-check). ✓
- Build (S9) self-reported PASS in changes.md:44; not re-run by reviewer (git-only persona), but the deterministic tsx gates all pass and the only signature change has its sole caller awaited.

The spec is NOT hollow: S1.8 asserts the action union is `⊆ {acquire,enable,disable}` AND that `noop`/`blocked`/`denied` are never returned (would catch a regression that reintroduced a dead-end); S2 asserts device-naming, address-bar affordance, the PermissionDeniedError alias, and the no-permanence-words contract. These would fail on a symptom-only fix.

STATUS: DONE (APPROVE)
