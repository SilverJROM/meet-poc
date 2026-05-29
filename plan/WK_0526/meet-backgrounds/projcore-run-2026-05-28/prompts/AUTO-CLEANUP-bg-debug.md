# Autonomous CLEANUP — revert BG-DEBUG instrumentation

> Per JROM directive: "i dont want them piling up once this is fixed". Task #18 in TaskTracker.

## What to REMOVE

All code marked with `// BG-DEBUG START` / `// BG-DEBUG END` comments OR labeled `// BG-DEBUG temp`:

1. `backend/src/modules/bg-debug/` — delete the entire directory (module is BG-DEBUG only)
2. `backend/src/server.ts` — remove the `import { bgDebugRouter }` line and the `app.use('/api', bgDebugRouter())` line (both marked with BG-DEBUG comments)
3. `frontend/src/app/services/bg-debug.service.ts` — delete the entire file
4. `frontend/src/app/services/background-effects.service.ts` — remove:
   - `import { BgDebugService } from './bg-debug.service'` line
   - `private readonly bgDebug = inject(BgDebugService);` line
   - the BG-DEBUG counter fields (`onResultsCount`, `drawFrameCount`, `sendCount`, `skipReadyStateCount`, `firstUsableDimsLogged`)
   - every `this.bgDebug.log(...)` call site
   - any related state (e.g., the `firstUsableDimsLogged` reset in `processStream`)
5. `frontend/src/app/pages/room/room.page.ts` — remove:
   - `import { BgDebugService } from '../../services/bg-debug.service'` line
   - `private readonly bgDebug = inject(BgDebugService);` line
   - the BG-DEBUG `effect()` block (logs pair-change of raw/effective track id) — entire block between BG-DEBUG markers
6. `frontend/src/app/components/lobby-preview/lobby-preview.component.ts` — remove:
   - `import { BgDebugService }` line
   - the BG-DEBUG block (private logger inject + `lastLoggedTrackId` field + the logger call inside the effect)
   - keep the core `if (video) video.srcObject = stream;` behavior intact
7. PM2 env: unset `BG_DEBUG_ENABLED` from `meet-poc-be` (after restart it should be `undefined`)
8. `logs/bg-debug.jsonl` — delete the file

## What to KEEP (do NOT remove)

These are real fixes, not instrumentation:

1. **`frontend/angular.json`** — MediaPipe assets glob (bundles model/wasm at `assets/mediapipe/`)
2. **`scripts/serve.js`** — `MIME_TYPES` map (wasm/svg/font extensions). The dynamic `application/wasm` MIME is required.
3. **`frontend/src/app/services/background-effects.service.ts`** — `locateFile: (file) => 'assets/mediapipe/' + file` AND the `NgZone.runOutsideAngular` wrapping for rAF/onResults/model.send
4. **`frontend/src/app/components/background-picker/background-picker.component.{ts,html}`** — selection-revert on `setMode` failure, `lastError` display
5. **`frontend/src/app/components/lobby-preview/lobby-preview.component.{ts,html,scss}`** — the "Background ▸" collapse toggle (separate from instrumentation)
6. **`frontend/src/app/pages/room/room.page.html`** lines 410, 421 — `@if/@else` ion-icon replacements (real fix for Stencil bug)
7. **All 5 autonomous asks** (`094147e`, `6ff4df4`, `04c452a`, `bee02e3`, `726227c`) — JROM wants these

## Validation

1. Backend build PASS
2. Frontend ng build PASS
3. `curl -X POST http://localhost:4700/api/bg-debug/log -d '{}'` returns 404 (route removed)
4. fixloop-banner suite + all 5 ask-specific specs PASS (Ask #1 host self-view, Ask #2 picker draggable, Ask #3 reactions, Ask #4 layout, Ask #5 host-handoff)
5. ng build clean
6. Commit message: `chore(bg): revert BG-DEBUG instrumentation (task #18)`
7. Validation note: `validation/AUTO-CLEANUP-bg-debug.md` listing what was removed and what was preserved
8. Deploy: `pm2 restart meet-poc-be` AND `pm2 restart meet-poc-fe`

Final line MUST be EXACTLY: `STATUS: DONE — Cleanup complete; all asks deployed`

## Stop conditions

- If a real fix is entangled with instrumentation in a way that makes surgical removal risky, STOP and propose minimal alternative.
- If removing instrumentation breaks any currently-passing spec, STOP and surface — instrumentation should be additive, not load-bearing.
