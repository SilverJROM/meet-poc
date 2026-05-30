# validation/batch-3a — projcore gate (R4 user toggle)
**Verdict: PASS** · HEAD 477d9a4.
- Diff (6 files +206/−9, settings+prefs scope): diagnostics-prefs.ts single-sources the key + reader (contract byte-for-byte) + writer; room.page.ts duplicate const+reader DELETED (no dead code, deferral OFF) + imports shared; account-settings Account-tab toggle seeded from reader (not hardcoded), persists on change; gates (start/queue/flush) unchanged — flush early-returns before collect AND upload.
- Build ✓ BE+FE green. Test ✓ diagnostics-prefs.spec.ts (real exports) passed (I re-ran). Dup-check ✓ key literal exists ONLY in diagnostics-prefs.ts repo-wide.
- Q0: R4 covered (toggle gates collect+upload; default ON). Residual: live two-party POST start/stop = manual (NS5).
- R4 → VERIFIED (live @manual).
