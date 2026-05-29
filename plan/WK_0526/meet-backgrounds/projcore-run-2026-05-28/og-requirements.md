# OG Requirements — Phase 2b: Background effects
**Created:** 2026-05-28
**Source:** JROM verbatim: "lets have like some 5 normal backgrounds and like 10 anime backgrounds like dbz, samurai x, death note, one piece, etc themes" + "have a way that host can upload custom background as well" + frontloaded answers to library/mobile/asset/storage questions.

## Background
Phase 2b ships the foundation + 5 generic + custom upload. Phase 2c (country-themed/anime-style art) is a separate run requiring asset sourcing.

## Requirements

### R18 — Segmentation foundation + Blur mode

| Acceptance | Detail |
|------------|--------|
| Service exists | New `frontend/src/app/services/background-effects.service.ts`. Public API: `setMode('none' \| 'blur' \| 'image')`, `setBackgroundImage(dataUrlOrAssetPath)`, `processStream(input: MediaStream): MediaStream`. |
| MediaPipe wired | Use `@mediapipe/selfie_segmentation` (or `@mediapipe/tasks-vision` if codex chooses newer API). Load model lazily on first non-none mode. |
| Blur mode works | Mode='blur' returns a composite stream where person is sharp, background is blurred (radius ~12px). Live updating per frame. |
| Track replaced in SFU | When effect mode changes, call `sfuClient.replaceVideoTrack(processedTrack)`. Other peers see the composite. |
| Local self-view shows composite | Local tile renders the processed stream (matches what others see). |
| Frame rate | Targeted 30fps on modern desktop; gracefully drops on weaker devices. No hard requirement on mobile yet (R21 gates that). |
| Falls back gracefully | If model load fails, set mode='none' silently, log a console warning. Don't break the call. |

### R19 — 5 generic backgrounds + picker UI

| Acceptance | Detail |
|------------|--------|
| 5 assets bundled | `frontend/src/assets/backgrounds/` contains: `city.jpg`, `library.jpg`, `beach.jpg`, `mountain.jpg`, `gradient.jpg` — royalty-free CC0 from Unsplash/Pexels. Each ≤500KB. |
| Picker UI in lobby | Lobby has a "Background" section with thumbnails: None, Blur, 5 generic, (Custom uploads from R20 inserted here later). Clicking switches mode. Selection persists per-session via localStorage. |
| Picker UI in-call | Controls-bar has a button (e.g., wand icon) that opens the same picker as an overlay. Live update. |
| Mode applied at join | If user joined lobby with mode=blur, the SFU publish at admit uses the processed stream from the start. |
| Asset attribution | A `backgrounds/CREDITS.md` file with photographer + Unsplash/Pexels URLs (CC0 is permissive but credit is courteous). |

### R20 — Custom background upload

| Acceptance | Detail |
|------------|--------|
| Upload UI | Picker has "+ Upload custom" button. Opens file input (accept=image/*). |
| Resize + compress | Selected image is resized to fit ≤1280×720 (preserving aspect) and re-encoded as JPEG quality 0.85. Target ≤1MB final size. |
| Persist | Stored in localStorage as data URL with key `meet-poc:bg:custom:<id>`. Max 5 custom uploads per browser (FIFO eviction). |
| Picker shows customs | Custom uploads appear as additional thumbnails in the picker. Click to apply. |
| Delete | Each custom has a small × to delete from localStorage. |
| Persistence across sessions | Custom uploads survive page reload. Last-selected mode also persists. |

### R21 — Mobile opt-in warning

| Acceptance | Detail |
|------------|--------|
| Detection | `viewport.isMobile()` (existing) drives the policy. |
| Default off on mobile | New user opens lobby on mobile: picker shows None selected, no effect active. |
| Warning text | Above the picker on mobile: "Background effects may drain battery and reduce video quality on this device." |
| Opt-in works | User can still choose blur or a background. Once chosen, persists like desktop. |
| Default off desktop | Same default behavior — None is the default until user picks something. (R21 is really just a mobile-specific notice; desktop behavior unchanged.) |

### R22 — Phase 2b test gate

| Acceptance | Detail |
|------------|--------|
| Backend build | `cd backend && npm run build` — 0 errors. |
| Frontend build | `cd frontend && ng build` — 0 errors. New bundle includes MediaPipe assets. |
| e2e regression | `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — existing 16 specs PASS. |
| New playwright spec | `background-effects.spec.ts` — start a call, change mode to blur, assert the local tile's video element has a stream whose ID differs from the unblurred capture (proxy for "composite stream is in use"). Don't try to verify the pixels themselves (too brittle). |
| Manual smoke | JROM can verify visually that blur, each generic background, and custom upload work end-to-end. |
