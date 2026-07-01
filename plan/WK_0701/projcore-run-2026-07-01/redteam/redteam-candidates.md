# Red-Team Candidates (back gate — breaks the IMPLEMENTED diff) — WK_0701

Frozen at Phase 0; finalized in the B0 co-planner session. Panel never writes the fix
(verifier ≠ fixer). Convergence (N-consecutive-clean over distinct lenses) = PASS.

- **B2 — Subscribe/rejoin recovery → tier: ELITE** [approved]
  Highest regression risk. Rotating lenses: duplicate subscriptions · ghost/orphan remote
  streams after rejoin · retry storms (unbounded escalation) · clobbering unrelated healthy
  streams during a fresh-cfSessionId rejoin · silent UI failure · stale SFU session state.

- **B3 — Stalled-audio recovery → tier: STANDARD** [approved]
  Lenses: per-publisher recovery killing healthy neighboring streams · healthy-silence
  (mic-off) misclassified as broken → needless churn · concealed-sample false positives.

- **B4 — Publish/PC recovery → tier: STANDARD** [approved B0-consensus 2026-07-01]
  Glory-like `hasPc:false`/never-published was a real participant-breaking mode in the 5-way call.
  Lenses: publish-retry vs rejoin race · re-publish clobbering an already-healthy publish ·
  unrecoverable-state UI actually shown (not silent) · epoch-guard on stale publish continuations.

- **B6 — Multi-participant capstone → tier: STANDARD** [approved]
  Lenses: 5-way subscription-graph races · recovery under concurrent joins/leaves ·
  cross-participant clobber · test validity (real DOM/RTP proof, not attempt-only).

Mid-run auto-suggest (§1.4g) may add candidates silently on recurring-bug/hardened/security class.
