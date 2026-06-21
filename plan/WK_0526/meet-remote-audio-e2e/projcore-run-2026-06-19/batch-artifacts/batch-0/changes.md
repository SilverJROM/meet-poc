# B0 Changes — DEV up + local 2-client audio rig + measurement module

**Batch:** batch-0  
**Branch:** feat/remote-audio-e2e-20260619  
**Room for B1 reuse:** 3073e6a60221 (slug: ra-e2e-1781912741080-cr2u9 , title: RA-E2E-1781912741080-cr2u9) — kept, never touched TEST_ROOM01/testroom01001.  
**Status:** build + local mutual-audio check GREEN.

## DEV-up steps executed
- `pm2 delete meet-poc-be meet-poc-fe || true`
- `pm2 start ecosystem.config.js`
- `cd backend && npm run seed` (migrations run automatically on server start via db.ts:runMigrations)
- Polled until `curl -fsS http://localhost:4720/health` → 200 + `curl -fsSI http://localhost:4700/login` → 200
- Procs: meet-poc-be + meet-poc-fe online.

No code changes to backend for bring-up.

## Guardrail #1 — Live rendered app inspection (MANDATORY, no assumption)
Before writing rig code:
- Launched real DEV (PM2 :4700).
- Drove host (authenticated) create + join to in-call.
- Drove unauthed guest knock.
- On host, waited for knock UI to appear.
- Captured:
  - guard1-full-call.png
  - guard1-knock-toast.png (primary)
  - guard1-admit-button.png
  - guard1-admit-container-*.png
- Dumped exact DOM for Admit control:
  ```json
  {
    "tag": "BUTTON",
    "text": "Admit",
    "ariaLabel": null,
    "title": "Admit",
    "class": "primary-btn",
    "parentClass": "knock-toast-actions",
    "parentTag": "DIV",
    "closestKnockToast": true,
    "closestWaiting": true
  }
  ```
- Confirmed working selector (used in rig):
  `host.locator(".knock-toast").filter({ hasText: "<guest>" }).getByRole("button", { name: "Admit" })`
- Fallback (also discovered): after Show participants → getByLabel('Waiting to join') row → Admit.

Screenshots + logs in batch-artifacts/batch-0/screenshots/ (from _tmp run) and the final b0-2-tile-*.png.

## Exact join path (for B1+ reuse, verbatim)
**Host (owner):**
1. Auth as jrom@silverjrom.app (from INITIAL_PASSWORD.txt at runtime)
2. `page.goto(room.url + '?sfu=0')`
3. Expect heading(room.title)
4. Drive lobby preflight if present: "Test / configure devices" → "Test speaker" → click "Yes" (speaker-confirm-yes) → "Confirm — everything works"
5. `page.locator('#display-name').fill(name)`
6. `getByRole('button', { name: 'Join' }).click()`
7. Expect `.call-panel` + 1 `app-tile`

**Guest (knock):**
1. `page.goto(room.url + '?sfu=0')`
2. Handle possible guest name overlay (#guest-display-name + Continue)
3. Drive same preflight gate (Test speaker + Yes + confirm)
4. `locator('#display-name').fill(name)`
5. `getByRole('button', { name: 'Ask to join' }).click()`
6. Expect knocking text: /Asking the host to admit you|The host is available/

**Admit (host only):**
- Primary: `.knock-toast` filter hasText(guest) → `getByRole('button', {name: 'Admit'})`
- Wait guest `.call-panel`, host tiles → 2

## Code changes
New (all under e2e/ for reuse by B1-B4):
- `e2e/fixtures/audio/tone-440.wav` + `tone-880.wav` (ffmpeg lavfi sine 6s, 48kHz mono 16-bit)
- `e2e/fixtures/audio-rig.ts` (shared):
  - `measureInboundAudio(page, peerLabel, opts)` — page-context: AnalyserNode RMS sampling + sfu inbound-rtp bytes delta polling. Returns {energyRmsPeak, energyAboveFloorMs, inboundBytesDelta, pass, ...}. Calibrated floor, >=3s + bytes>0.
  - `launchClientWithFakeAudio(wavPath)` — dedicated chromium + exact --use-file flag.
  - `createThrowawayRoom`, `joinAsHost`, `knockAsGuest`, `admitFromHost` (uses inspected selector), `assertMutualAudio`, `captureProofArtifacts`.
- `e2e/tests/remote-audio/b0-local-mutual-audio.spec.ts` — the atomic proof vertical slice.

No production call logic touched (only e2e harness + fixtures). No dead code, no TODOs.

## Root cause / findings
- None blocking. Lobby preflight gate (micWorking + speakerVerified) required explicit drive for fake media (Test speaker + Yes + confirm + energy from WAV file). Fixed in rig by driving the dialog + using distinct file per client.
- Existing joinOwnerCall / knock helpers were close but needed preflight + guest overlay handling for current lobby.
- SFU local loopback audio + getStats + remoteStreams work for measurement.
- Energy + bytes delta both trigger cleanly with distinct tones.

## Artifacts produced
- batch-0/scenarios.md
- batch-0/changes.md (this file)
- batch-0/screenshots/b0-2-tile-in-call*.png (2-tile view)
- batch-0/metrics/b0-mutual-metrics.json (dual PASS with numbers)
- Test run logs show explicit PASS both directions + room id.

## Repro
```bash
E2E_BASE_URL=http://localhost:4700 npm test -w e2e -- tests/remote-audio/b0-local-mutual-audio.spec.ts --config=playwright.config.ts --workers=1
```
(Assumes DEV up via PM2 + seeds.)

STATUS: build + local 2-client mutual-audio check are green.
