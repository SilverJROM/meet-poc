# context-handoff.md — for B2 (post-/clear)

## Run state
- Branch: feat/host-audio-playout-mic-persist-20260601 (off master d3591e4).
- B1 (R1, host remote-audio playout): DONE + independently VERIFIED by projcore. Commits 2c0b2c5 + be8cbb0. Deployed live (voice.silverjrom.app 200). R1.1 (real playout) pending JROM live two-machine call only. **Do not revisit B1.**
- B2 (R2, mic-selection persistence): NOW. Brief at prompts/batch-2.md.

## Project facts the implementer needs
- FE: Angular 20 standalone + signals. Build: `npx ng build` (from frontend/). Unit specs: node:assert style, run `npx tsx <spec>` (see frontend/src/app/services/remote-audio-health.spec.ts + remote-audio-playability.spec.ts for the pattern). `ng test` is karma and not the convention used here.
- Deploy DEV = build FE + `pm2 restart meet-poc-fe` (and meet-poc-be if backend touched — B2 is FE-only). Live URL voice.silverjrom.app.
- e2e: Playwright under e2e/, fake-media flags; isolated DB via MEET_DB_PATH (B1 used data/e2e-b1/). If B2 adds an e2e, isolate its DB and do NOT pollute data/meet-poc.sqlite (the live DB).

## B2 is independent of B1's internals
B2 touches the device-SELECTION/persistence path (changeAudioDevice / replaceInCallAudio / ensureSelectedAudioDevice / preferredDeviceId / readStoredDevice-restore + device-dialog component). It does NOT need B1's remote-audio playout code. Keep them separate.

## projcore validation bar for B2
Mechanism-level root cause (the exact reverting line, proven by repro), unit-provable persistence decision fn + spec, fallback-preservation (unplugged ⇒ fallback OK; present-but-reset ⇒ bug), no scope creep. Verifier ≠ fixer — projcore re-runs the spec + reads the diff before VERIFIED.
