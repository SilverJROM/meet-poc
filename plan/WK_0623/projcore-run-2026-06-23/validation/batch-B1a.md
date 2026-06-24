# Validation — batch-B1a (phantom-? fix) — VERDICT: PASS
Date 2026-06-23. Independent coordinator gate (grok self-report NOT trusted, §1.14). Impl: grok composer.
- speaker_for_ms REMOVED (transcribe.py) — no '?' structurally possible for per-person files.
- Per-person words attributed to file owner via read_participant_owner + label_words_with_owner (R1.1, R1.2).
- Mixed file: owner is None → skipped (return 0), never transcribed; not in named-transcript per-user set (R1.3).
- named-transcript/:sessionId remains canonical merge (R1.4).
- ARTIFACT PROOF (independent): re-transcribed recordings/...alice_ea6513.webm → line+word names {'Alice'},
  literal grep '"name": "?"' count = 0. Mixed dc411e → "skipped: not a per-user recording" exit 0.
- PY tests run independently (unittest): test_label_words_with_owner_never_emits_question_mark +
  test_build_lines_groups_owner_words_only → Ran 2, OK (real asserts: assertNotIn("?", names)).
- Build: backend tsc PASS, frontend ng build PASS.
7-gate + Q0-Q7 all green. R1.1-R1.4 VERIFIED.
Note: existing OLD transcripts still contain '?' (pre-fix output) — forward-looking fix; optional cleanup not in scope.
