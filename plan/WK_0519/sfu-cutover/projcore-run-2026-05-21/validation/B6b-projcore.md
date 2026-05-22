# projcore gate — B6b (SR-6 part 2) — PASS (iter3) → SR-6 VERIFIED
Commit: 40b1782 on feat/sfu-cutover. Codex iter3: VALIDATED-PASS (after 2 prior FAILs — verifier≠fixer caught a real core-path bug green tests had hidden).
History: iter1 FAIL (empty-mid PUT rejected; test only checked request body) → iter2 FAIL (mid reconciliation collided on duplicate empty mids; CF returns mid:"" for multiple tracks) → iter3 PASS (pure helper reconcileSubscribedMids: positional responseTracks[i]↔newTransceiverMids[i], real-mid-only keys; collision unit test).
7-gate: artifacts✓ diff✓(sfu-mid-reconcile.ts new 25L, sfu-client +29/-25, spec +31; mesh UNCHANGED) build✓ tests✓(unit duplicate-empty-mid collision PASS; 3 e2es PASS — desktop 'h'/mobile 'l'/update 2xx/regression) evidence✓(codex source review confirms no collision; positional matching sound) req✓(SR-6 VERIFIED) standing-rules✓.
WATCH-ITEM: layer-pref e2e had ONE transient miss (PUT-update response capture timed out) then passed on rerun — minor timing flakiness; revisit poll window if it recurs in B10 full-suite. NOT a correctness issue.
VERDICT: PASS. SR-6 VERIFIED (B6a+B6b). Advance to B7.
