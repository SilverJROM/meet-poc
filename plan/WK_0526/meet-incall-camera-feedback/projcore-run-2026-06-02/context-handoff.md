# context-handoff.md — meet-incall-camera-feedback

## Run state
- Branch: feat/incall-media-always-enableable-20260602 (off master a4c81cc).
- B1 (RC): in-call mic+camera always enable-able / never stiff. Brief: prompts/batch-1.md.
- B2 (RF): same-room feedback SUPPRESSION-ONLY (no UI/auto-mute — JROM decision). After B1.

## Project facts
- FE Angular 20 standalone+signals. Build `npx ng build` (from frontend/). Pure specs node:assert via `npx tsx <spec>` (see remote-audio-playability.spec.ts / device-selection.spec.ts). NOT `ng test`.
- Deploy DEV = build FE + `pm2 restart meet-poc-fe`. Live voice.silverjrom.app.
- e2e Playwright under e2e/, fake-media flags (--use-fake-ui-for-media-stream auto-grants; to simulate DENY use --use-fake-device + permission overrides). Isolate any e2e DB via MEET_DB_PATH; never pollute data/meet-poc.sqlite.
- Publish path: video via replaceEffectiveVideoTrack→sfuClient; audio via media.replaceAudioTrack→sfuClient.replaceAudioTrack. Reuse these.

## projcore bar
Mechanism-level root cause, surgical (NS5), no regression to prior fixes, honest about the browser-block platform limit. Verifier ≠ fixer — projcore re-runs build/specs + reads diff before VERIFIED.
