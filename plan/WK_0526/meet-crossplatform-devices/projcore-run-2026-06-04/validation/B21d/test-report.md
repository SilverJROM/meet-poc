# Batch-21d Test Report

## Commands

```bash
npx tsx frontend/src/app/pages/room/room-decisions.spec.ts
```

Result: PASS

Output:

```text
room-decisions: all assertions passed
```

```bash
cd frontend && npx ng build
```

Result: PASS

Notes: Angular build completed successfully. Warnings were pre-existing/non-B21d: unused `DatePipe` in `RoomsPage`, Stencil empty glob, and CommonJS warning for `@mediapipe/selfie_segmentation`.

```bash
git diff --check -- frontend/src/app/pages/room/room.page.ts frontend/src/app/pages/room/room-decisions.ts frontend/src/app/pages/room/room-decisions.spec.ts frontend/src/app/services/meeting-sessions.service.ts
```

Result: PASS

```bash
pm2 restart meet-poc-fe
curl -fsSI http://localhost:4700/login
```

Result: PASS. `meet-poc-fe` restarted online and `/login` returned `HTTP/1.1 200 OK`.

## Scenario Coverage

- SC-ERR6: PASS by `shouldRearmLobbySelfTest()` spec and `unlockAudioFromGesture()` wiring.
- SC-ERR6-DUP: PASS by `alreadyRunning` false-case spec and existing `startLobbySelfTest()` timer guard.
- SC-ERR7: PASS by Angular build and structural review of `buildDiagnosticsPayload()` + `DiagnosticsPayload`.
- SC-REG: PASS by diff review; self-test thresholds and B16 ICE fields were not edited.
