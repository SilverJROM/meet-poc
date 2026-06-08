# North-star — Regression-Coverage Mission (2026-06-08, JROM autonomous mandate)
## Mission (JROM verbatim intent)
Review ALL past calls in diagnostics, recreate EVERY distinct failure signature as a test (so no regressions),
+ web-research known WebRTC/cross-platform issues (codex5.5/5.4/sonnet/haiku) and test those too. Build the tests,
run against the app, generate an issues list, FIX everything, rebuild live. Return ONLY with confidence that every
previously-seen + researched-known issue is covered by a PASSING test and fixed — so the app can only fail on
something genuinely NEW.
## Frontloaded decisions (JROM, 2026-06-08) — LOCKED
1. Scope: ALL failure classes (audio/video/record/connection/device/relay/autoplay/mobile-bg/etc.).
2. Corpus: ALL sessions in the DB with diagnostics (deduped to distinct signatures, prioritized severity+recency).
3. Harness: BOTH tiers — (T1) telemetry-REPLAY of each real call's exact getStats into the decision logic (deterministic, faithful), (T2) real-browser harness (Chrome --use-file-for-fake-audio-capture + PulseAudio null-sinks + parecord proof) for critical audio/video/record paths.
4. Autonomy: FULL to completion. No mid-run questions. CRITICAL-resets gate (talk/record/see). verifier!=fixer. Make all clean-technical calls. Stop ONLY for a true blocker (contradictory data / uninstallable infra / destructive-irreversible op).
## DONE bar
Every distinct historical failure signature + every researched known-issue has a test that PASSES on the current app; any that FAIL are fixed → re-pass. Full historical+known regression suite green. Live app rebuilt.
## Discipline
- CRITICAL = talk(hear+be-heard)/record/see broken → must be fixed. NON-CRITICAL fixed-if-seen.
- Test pollution: clean up any rooms/sessions created during testing; persistent room = TEST_ROOM01 (testroom01001).
- Reuse the 6-model panel (meet-panel-*) + implementer (meet-codex-impl).

## Routing adjustment — 2026-06-08 (JROM): conserve Opus (at 91%)
- Opus (coordinator) = LIGHTWEIGHT only: dispatch, read short status/verdict lines, synthesize, decide. NO Opus deep-reads / per-round Opus verdict files / Opus re-running suites.
- INDEPENDENT VALIDATION (verifier!=fixer) delegated to SONNET (session meet-sonnet-validator), codex-5.5 backup. Implementer = codex gpt-5.5 (meet-codex-impl). Panel review = the 5 non-opus models.

## Usage state + budget routing — 2026-06-08
- Claude pool (opus/sonnet/haiku) worst_bucket ~91% (9% left, resets Jun 9 16:00 UTC). Codex (codex55/spark) ~79-95% (~21% left).
- BOTH tight. This mission runs HEAVY work on CODEX (codex55/gpt54/spark panel + codex-impl + codex-validator). CLAUDE (sonnet/haiku panel + opus) reserved: opus = lightweight coordinator only; sonnet/haiku used ONLY if a codex tie/deadlock needs a tiebreak.
- Monitor: usage-monitor.log, 90min cadence, alerts at Claude>=96 / Codex>=95 → I throttle/triage (prioritize cheap telemetry-replay tests over the expensive real-browser harness if budget runs low).

## Panel roster — 2026-06-08 (JROM): drop haiku, 1x spark (spark2 dropped — codex budget low)
Panel (JROM 2026-06-08, trimmed for budget) = codex55 + spark + sonnet. gpt54+spark2+haiku dropped. impl=codex, validator=codex, opus=light coord.

## Session hygiene — 2026-06-08 (JROM): drop unused agent sessions
Only the ACTIVE agent for the current phase stays alive. Panel (codex55/spark/sonnet) + validator spawned JIT per phase, torn down when idle. During Phase C build: only meet-codex-impl alive. Re-spawn validator at Phase C gate, panel at Phase D red-team.
