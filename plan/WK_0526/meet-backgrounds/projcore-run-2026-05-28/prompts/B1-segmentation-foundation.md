# Batch B1 — Segmentation foundation + Blur mode (R18)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore is supervising from session `lkvc` and watching this session (`lkvc-codex`) for your STATUS callback. Do NOT invoke the `$projcore` skill, do NOT spawn additional sessions, do NOT modify queue.md / progress.md / req-matrix.md / context-handoff.md / north-star.md / og-requirements.md / callbacks.md. Just implement THIS batch's scope and emit `STATUS: DONE — Batch B1 ready for validation` when finished.

## Plan handshake — MANDATORY before code

This is the largest non-trivial batch in Phase 2b (new dependency, new service, threaded into existing media pipeline). DO NOT just start writing code. Read this brief in full, then read the existing media path:

- `frontend/src/app/services/media.service.ts` — owns `localStream`, `cameraOn`, `toggleCamera`, etc.
- `frontend/src/app/services/sfu-client.service.ts` — find `replaceVideoTrack` (line ~149-150 + `doReplaceVideoTrack`).
- `frontend/src/app/components/lobby-preview/` and `frontend/src/app/components/tile/tile.component.ts` — where local self-view renders.
- `frontend/src/app/pages/room/room.page.ts` — find `toggleCamera`, `joinPublishFlow`, anywhere a video track is handed to SFU.

Then reply with `STATUS: PROPOSED — <approach summary>` containing:
1. Which npm package (`@mediapipe/selfie_segmentation` per north-star D1, OR `@mediapipe/tasks-vision` if you have evidence it's the cleaner fit — justify in 1 line).
2. Where the service goes and the public API surface (`setMode`, `setBackgroundImage`, `processStream`, `dispose`).
3. How the composite stream replaces the SFU sender's track AND drives the local self-view (one source of truth — both should see the SAME stream).
4. Risk: what existing flow could break (e.g., `replaceVideoTrack` during a renegotiation, camera-flip on mobile, screen-share fallback path).
5. One concrete acceptance check (specific assertion).

Wait for projcore `APPROVED-PLAN` before writing code.

## Scope (after APPROVED-PLAN)

### R18.1 — New service file

Create `frontend/src/app/services/background-effects.service.ts`:

```ts
@Injectable({ providedIn: 'root' })
export class BackgroundEffectsService {
  readonly mode = signal<'none' | 'blur' | 'image'>('none');
  readonly modelReady = signal(false);
  readonly lastError = signal<string | null>(null);

  // Public API
  async setMode(next: 'none' | 'blur' | 'image'): Promise<void>;
  async setBackgroundImage(source: HTMLImageElement | string): Promise<void>;
  processStream(input: MediaStream): MediaStream;  // Returns either input (mode='none') OR a captureStream of the composite canvas (mode='blur' or 'image').
  dispose(): void;  // Tear down model + canvases + animation frame.
}
```

Internals:
- Lazy-load MediaPipe model on first `setMode('blur' | 'image')`. If load fails: set `lastError`, force `mode='none'`, log warning, return input stream from `processStream` (graceful degrade).
- Use an `OffscreenCanvas` if available (worker-friendly) OR regular `<canvas>` fallback.
- Animation frame loop: draw input frame to canvas → segmentation mask → composite. Compose strategy:
  - **Blur**: draw blurred copy of input frame in background, draw input frame masked by `mask` on top.
  - **Image**: draw `backgroundImage` in background, draw input frame masked on top.
- Output: `canvas.captureStream(30)` returns a MediaStream with a single video track.

### R18.2 — Wire to local + SFU

ONE source-of-truth. When `mode !== 'none'`:
1. Take `media.localStream()`'s video track as input.
2. Pass through `backgroundEffectsService.processStream(...)` → composite stream.
3. The composite stream's video track is what gets BOTH:
   - rendered in the local self-view tile (`peer.stream` for the local peer points at composite)
   - replaced on the SFU sender via `sfuClient.replaceVideoTrack(compositeVideoTrack)`

When `mode === 'none'`: use `media.localStream()` directly, restore SFU sender's track to the original camera track.

Suggest a small wrapper signal in `room.page.ts` or new helper that derives the "effective video track" from `media.localStream()` + `backgroundEffectsService.mode()`. Mode changes trigger `replaceVideoTrack` calls and a local self-view re-bind.

### R18.3 — Lobby preview integration

The lobby's `app-lobby-preview` shows the camera preview before joining. Wire it to show the composite stream too — so user sees their selected effect BEFORE joining. The picker UI doesn't exist yet (B2 ships that); for B1, a temporary inline toggle in the lobby is enough to demonstrate the pipeline:

Add a temporary `<button>` next to the camera toggle: "Try blur (preview)". Click → `backgroundEffects.setMode('blur')`. Click again → 'none'. Make this button conditional `@if (devModeBgBlur())` so it's easy to remove in B2 when the proper picker lands. The button is just for B1 acceptance.

### R18.4 — Manual self-check

Before committing, run:
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors. (npm install MediaPipe first.)
3. Manual: open the dev URL, enter lobby, click "Try blur (preview)". Verify camera preview shows blur. Take a screenshot for `validation/B1-blur-preview-screenshot.png`.
4. Manual: join the call (host). Verify a 2nd browser sees the blurred host video too.
5. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — existing 16 PASS (no regression).

## Hard constraints

- ONLY touch: new `background-effects.service.ts`, `media.service.ts` (if needed for hooks), `sfu-client.service.ts` (if needed for type updates), `lobby-preview.component.ts/html/scss` (temporary B1 toggle), `room.page.ts` (wiring), `package.json`/`package-lock.json` (new dep). NO other files.
- DO NOT add ANY picker UI in this batch (B2's job). Just the temporary toggle.
- DO NOT touch backend.
- DO NOT load the model eagerly on app start — must be lazy on first non-none mode (perceived perf).
- Handle the model-load-failed path explicitly. Don't crash the app.

## Acceptance gate

1. Code review by projcore: `processStream` returns a non-input stream when mode!='none', returns input when mode='none'. `setMode('blur')` triggers SFU `replaceVideoTrack` exactly once per transition. Local self-view sees the SAME stream as remote peers.
2. Build + existing e2e green.
3. Manual blur preview screenshot in `validation/`.
4. Write `validation/B1-segmentation-foundation.md`: files touched, library chosen + version, the public API surface, the wiring approach, risk-assessment summary, perf cost observed.
5. Commit message: `feat(bg): segmentation foundation + blur mode (R18)`.

## Stop conditions

- If MediaPipe model fails to load reliably in this environment (e.g., CSP blocks the model URL, or the package version is broken), STOP, document, propose alternative library — DO NOT silently swap.
- If `replaceVideoTrack` interactions with active screen share or camera flip would cause regressions in the existing 16 e2e specs, STOP and report — that's R18.2 wiring scope, may need a narrower implementation.

Final line MUST be EXACTLY: `STATUS: PROPOSED — <one-line approach summary>` for the handshake, then after APPROVED-PLAN: `STATUS: DONE — Batch B1 ready for validation`.
