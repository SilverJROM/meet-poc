# Consultation round 2 — backend log endpoint + frontend instrumentation

## Where we are

Round 1 confirmed: wiring works under headless playwright with `fake_device_0`. JROM is on REAL Chrome, REAL camera, real network at https://voice.silverjrom.app. Picker selection ring updates on Blur, camera feed visually stays raw. JROM won't paste console snippets — he proposed: "log it while I do my tests."

## Proposed approach (per JROM)

**Backend log endpoint** the frontend can POST to during the rAF loop:

1. New BE route: `POST /api/bg-debug/log` — accepts `{ event: string, payload: any }`. Append to a single file `logs/bg-debug.jsonl`. Auth: same as existing /api routes (JROM is already authenticated). Rate-limit per session if needed (1 event / 100ms).
2. Frontend `background-effects.service.ts` instrumentation — fire an event for:
   - `setMode(next)` start + resolution + lastError
   - `ensureModel` model loaded
   - `processStream` invoked: input track id, video.videoWidth/videoHeight, canvas w/h, outputStream track id
   - `processFrame` skipped because of readyState (sample every 30 skips, not every one)
   - `model.send` resolved (first occurrence; then every 30th)
   - `onResults` count milestones (1, 5, 30) with mask dimensions
   - `drawCompositeFrame` first + every 30th
3. Frontend `room.page.ts` instrumentation — fire events for:
   - `effectiveLocalStream` computed re-runs (when video track id changes)
4. Frontend `lobby-preview.component.ts` instrumentation — fire event when `effect()` sets `video.srcObject` (include current/new track id).

Once shipped:
1. JROM hard-refreshes, clicks Blur, waits a few seconds.
2. I `tail -f logs/bg-debug.jsonl` and see ALL state in real time. That tells us exactly where the chain breaks on real Chrome.

## Also in the same pass

- Fix the ion-icon `[name]` dynamic binding error per round-1 (replace with static `@if/@else` at `frontend/src/app/pages/room/room.page.html:410, 421`). Don't shotgun other ion-icons — just the two we have stack-trace evidence for.

## Out of scope this pass

- DON'T change `background-effects.service.ts` algorithm logic.
- DON'T change `room.page.ts` `effectiveStreamForSourceTrack` logic.
- DON'T add picker UI changes.

## Asks (review before any edit)

1. Approve the backend log endpoint approach? Or do you see a better signal route (e.g., a SSE / websocket / Telegram-style direct ping)?
2. Approve the instrumentation list? Anything missing? Anything redundant?
3. Approve ion-icon fix scope (just the two lobby toggles, not the whole codebase)?
4. Any concerns about leaving the log endpoint in prod after this debugging session — should it be gated by an env var or feature flag?

Reply with: APPROACH OK / OBJECTIONS / REFINEMENTS / IMPLEMENTATION CHECKLIST. End with: STATUS: PLAN-AGREED.

Do NOT write code yet. We agree on the plan first; then you implement it.
