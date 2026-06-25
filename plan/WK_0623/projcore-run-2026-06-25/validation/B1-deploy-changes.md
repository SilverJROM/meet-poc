# B1 Deploy — Frontend rebuild validation

**Task:** Rebuild `frontend/dist/` so the recording-reliability fix (`flushRecordingForExit`, commit `1fbc273` Jun 24) ships in the live static bundle served by `scripts/serve.js`.

## Staleness confirmed (pre-build)

| Check | Result |
|-------|--------|
| Old `main-*.js` mtime | **Jun 23 12:31** — `main-2XZ22EDW.js` (156,189 bytes) |
| Source fix commit | `1fbc273` — **2026-06-24 00:45:33 +0000** (`room.page.ts`) |

Bundle was built **before** the fix landed.

## Build

```text
cd frontend && npm run build
```

**Result:** SUCCESS (exit 0). Application bundle generation complete in ~7s.

Last lines of build output:

```text
Application bundle generation complete. [7.032 seconds] - 2026-06-25T03:50:22.666Z

▲ [WARNING] The glob pattern import("./**/*.entry.js*") did not match any files [empty-glob]
▲ [WARNING] Module '@mediapipe/selfie_segmentation' used by '...' is not ESM

Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
```

(Warnings only; no errors.)

## Fresh bundle verified (post-build)

| Artifact | mtime | Notes |
|----------|-------|-------|
| `main-2XZ22EDW.js` | **Jun 25 03:50** | Hash unchanged; main entry chunk |
| `chunk-S7XKA6MZ.js` (lazy `room-page`) | **Jun 25 03:50** | Contains `flushRecordingForExit` |

**New main bundle filename:** `main-2XZ22EDW.js` (same hash as before; fix lives in lazy `room-page` chunk).

## `index.html` → bundle wiring

`frontend/dist/meet-poc-frontend/browser/index.html` references:

```html
<script src="main-2XZ22EDW.js" type="module"></script>
```

`scripts/serve.js` resolves `frontend/dist/meet-poc-frontend/browser` and reads files from disk per request — **no pm2 restart required** for this deploy.

## Verdict

**PASS** — Production Angular build succeeded; dist artifacts are fresh (Jun 25); `index.html` points at the rebuilt `main-2XZ22EDW.js`; room-page chunk includes the recording-reliability fix.