# validation/batch-6 — projcore gate (R9 /join back control)
**Verdict: PASS** · HEAD 909bec6.
- Diff clean: 3 source files (html +7, scss +21, ts +3/-1) + changes.md. No stray/clobber content (all 5 known join.page anchors present; /lead disclosed+reverted a mid-edit clobber, blobs re-diffed clean — I independently confirmed).
- `.lobby-back-link` + `<ion-icon arrow-back-outline>` + ternary: label AND href both key off signedIn() (mismatch structurally impossible); @if(ready()) prevents pre-auth flash; CUSTOM_ELEMENTS_SCHEMA added for ion-icon. Guest→/ "Back to home", signed-in→/app/rooms "Back to rooms" (route confirmed app.routes.ts:20 under authGuard).
- Build ✓ FE green. Tests ✓ 6/6 Playwright (real route render + cross-route nav + getComputedStyle, not theater per reviewer-verify + independent-validation). NO manual-pending (fully deterministic headless).
- R9 → VERIFIED.
