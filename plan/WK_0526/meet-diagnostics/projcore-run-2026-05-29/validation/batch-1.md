# validation/batch-1 — projcore independent gate (R1)

**Verdict: PASS** (verifier ≠ fixer — projcore independent review, not /lead's self-DONE)
HEAD: 3c1ebff (2 commits off baseline 81661dd) · branch feat/meet-diagnostics-audio-20260529

## 7-gate
1. **Artifacts** ✓ — scenarios/changes/review/test-report/independent-validation/unit-test-output + decision (micsilent truth-table) all present.
2. **Diff review** ✓ — 5 files, +195/−3, diagnostics-only, no scope creep. Read all source:
   - `mic-energy.ts` — pure truth-table helper. micSilent from INSTANTANEOUS audioLevel<0.01 (never cumulative); raw level + cumulative energy stored; null on absent stats (graceful, no false silence claim); true on muted live track; null on partial stats. **All 3 projcore must-dos honored exactly.**
   - `sfu-client.service.ts` — media-source/audio captured in its OWN loop (comment documents the candidate-pair `break` + non-guaranteed RTCStatsReport order hazard the dev's first cut had; REVISE caught it). null in early-return paths.
   - `room.page.ts` — derives from `outboundAudioSource` + GROUND-TRUTH track state (readyState==='live', track.enabled), not the stale micOn signal. Replaces the 3 hardcoded nulls. Per-sample cadence (inside buildDiagnosticsPayload). Client-side, not isOwner-gated → host AND guest.
   - `meeting-sessions.service.ts` — +1 line type field.
3. **Build** ✓ — backend `tsc` green; frontend `ng build` green (only pre-existing stencil-glob + mediapipe-CJS warnings, unrelated).
4. **Targeted test** ✓ — `npx tsx mic-energy.spec.ts` → "all assertions passed" (8 truth-table + 4 structural).
5. **Evidence quality (Q0)** — R1 logic + wiring + null-handling fully covered by unit + diff. RESIDUAL: live media-source `audioLevel` *emission* during a published SFU call can't be unit-proven (mocked). Risk LOW: media-source audio stats for a sendonly audio sender are standard Chromium behavior (it's how every WebRTC "you're speaking" meter works), AND this exact signal is live-exercised downstream by B2 (watchdog) + B5 (self-test) before final acceptance, AND nothing is user-visible. → carry a live-confirm to Phase 2 / first real call DB check.
6. **Req coverage** — R1 → VERIFIED (logic/build/test/diff); live emission to confirm at Phase 2.
7. **Standing rules** — decision logged (truth-table resolution). No illegal deferral (NS4): no TODO/FIXME; the "MANUAL-PENDING" items are environment limits (headless mic), not punts — covered by the Phase-2 live check.

## Live-confirm closure (Phase 2 / next real call)
Query `meeting_session_diagnostics` after any real call on the deployed build: assert `outboundAudioLevel` non-null and `micSilent` toggles with mute. If null → reopen R1.
