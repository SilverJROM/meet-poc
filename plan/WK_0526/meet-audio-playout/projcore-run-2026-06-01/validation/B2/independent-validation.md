# B2 Independent Validation — projcore (verifier ≠ fixer)
2026-06-02 ~01:49. Commits 1ed70d6 + 63d6f94 on feat/host-audio-playout-mic-persist-20260601.

VERDICT: PASS (R2.1/R2.3 VERIFIED; R2.2 reopen VERIFIED, reload-restore VERIFIED-PENDING-LIVE — fake-device harness regenerates deviceId per reload, so real-reload persistence is JROM seat; proven via unit P5 + manual M2).

Checks I ran independently:
1. Scope: git diff = device-selection.{ts,spec.ts}, room.page.ts (12L rewire), device-dialog.component.html (4L), b2-mic-persist e2e, validation. No SFU/B1/capture/diagnostics. CLEAN.
2. Decision fn (device-selection.ts resolveSelectedAudioId): precedence 1 adopt-concrete-track → 2 keep-chosen (THE FIX) → 3 restore-stored → 4 track-fallback (unplug) → 5 last-resort. Branch 2 fixes the clobber; branch 4 preserves legit unplug-fallback. Correct.
3. Unit spec: `npx tsx device-selection.spec.ts` → "all assertions passed", exit 0. P1-P7 incl. P1 (track '' ⇒ keep chosen, regression proof), P4 (unplug ⇒ fallback), P5 (reload restore). Q0 evidence-quality: asserts the OUTCOME of the decision. PASS.
4. Rewire: syncSelectedAudioIdToTrack (room.page.ts:2143) now routes through resolveSelectedAudioId with chosenId/trackReportedId/enumeratedIds/storedId. Correct.
5. DOM fix (divergence, in-scope): device-dialog mic <select> [value] → per-option [selected]="device.deviceId===selectedAudioId()". Correct Angular idiom for dynamic @for options (re-evaluated each render). Within brief's pre-authorized device-dialog + fix-actual-root-cause clause. PASS.
6. Build: independent `npx ng build` exit 0. Live bundle main-A36S6YAX.js == freshly-built HEAD ⇒ B2 deployed live. PASS.
7. No regression: branch 4 preserves unplug-fallback; mic-recovery sweep sites untouched (their empty-track-id display-lag is the logged out-of-scope caveat, never breaks capture).

CAVEATS accepted (logged, out of R2 scope):
- camera-select + speaker-select <select> have the IDENTICAL [value]-desync — deferred follow-up (same one-line [selected] fix).
- recovery sites 2314/2414 empty-track-id display-lag — out of scope per JROM Q1; never breaks capture.
