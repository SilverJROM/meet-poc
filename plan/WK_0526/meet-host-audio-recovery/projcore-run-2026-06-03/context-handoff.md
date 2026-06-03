# context-handoff.md — for B2 (post-/clear)

## Run state
- Branch: feat/host-audio-recovery-20260603. B1 committed @ adfebb9.
- B1 (R1) DONE + projcore-VERIFIED: kickstart muted <audio> per remote source (Chromium #121673) + auto-resume (interaction/visibility/keepalive/source-add) + banner fallback. e2e 6/6 (I ran it; E4 = alone-then-late-join auto-recovery passes). Deployed DEV. **Do not revisit B1; CALL its kickstart/resume from B2's recovery ladder, don't rewrite.**
- B2 (R2): self-healing per-party voice watchdog. Brief: prompts/batch-2.md.

## Project facts
- FE Angular 20 standalone+signals. Build `npx ng build` (frontend/). Pure specs node:assert via `npx tsx <spec>`.
- Deploy DEV = `pm2 restart meet-poc-fe`. Live voice.silverjrom.app. **LIVE ports: BE 4720, FE 4700 — NEVER touch.** e2e isolated ports 4740/41/42 + MEET_DB_PATH=data/e2e-<slug>/ — and the e2e webserver uses `ng serve` (cold compile ~90s; start it + poll /login before `playwright --reporter=list ... --reuseExistingServer`). NEVER seed/run e2e without MEET_DB_PATH isolation (seed targets live DB otherwise).
- B1 hooks available for tests: __meetDebug.remoteAudioMixer.debugSnapshot() (now incl. kickstartCount/kickstartPlayingCount), __suspendForTest, __injectRemoteSourceForTest.

## projcore bar for B2
Pure unit-testable detector (decideVoiceRecovery), reuse existing getStats poll, ladder calls B1 kickstart/resume, backoff/no-thrash, mutedAll must NOT read as failure, runs on all devices. Verifier ≠ fixer — projcore re-runs specs + e2e + reads diff before VERIFIED.
