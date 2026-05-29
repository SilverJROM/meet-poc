# North-Star — Phase 2b: Background effects (blur + generic + custom upload)
**Date:** 2026-05-28
**Pattern:** 2 — codex-in-tmux (parent-label `lkvc`, child `lkvc-codex` to be spawned)
**OVM:** `~/.claude/agents/lib/overmind.sh` with `--parent-label lkvc`
**Lifecycle:** pre-live (deferral OFF)

## Locked decisions (Phase 0 frontloaded interview, 2026-05-28)

| # | Decision | Answer |
|---|----------|--------|
| D1 | Segmentation library | **`@mediapipe/selfie_segmentation`** (industry standard, ~4MB model, WebGL/WASM). Codex may upgrade to `@mediapipe/tasks-vision` (newer MediaPipe Tasks API) during B1 PROPOSED if it's a cleaner fit. |
| D2 | Mobile policy | **Opt-in with warning.** Default = None on mobile. Picker shows option with "May drain battery / reduce performance" notice. Same picker on desktop, default = None. User's last choice persists. |
| D3 | Generic background assets | **Projcore-supplied royalty-free CC0** from Unsplash/Pexels: city skyline, library, beach, mountain, abstract gradient. Bundled in `frontend/src/assets/backgrounds/`. |
| D4 | Custom upload storage | **Per-user localStorage** as data URL. Resize to ≤720p, target ≤1MB. Per-browser/device. NO backend storage in Phase 2b. |
| D5 | Pipeline architecture | Canvas-based composite: `getUserMedia` track → canvas → MediaPipe mask → composite (blur original frame OR image bg) → `canvas.captureStream(30)` → `sfuClient.replaceVideoTrack(newTrack)`. Local self-view shows the composite stream. |
| D6 | Persistence | Last chosen background + custom uploads persist in localStorage. Loaded on lobby init. |
| D7 | Test gate | `cd backend && npm run build` + `cd frontend && ng build` + e2e fixloop-banner regression (16 existing) + new specs per batch. |
| D8 | Commits | One commit per batch. Codex picks branch (per established Phase 2a precedent — feature branch is fine). |
| D9 | Phase 2c (LATER, not this run) | 10+ country-themed original anime-style art. Need to source/commission first. |
| D10 | Phase 3 (TBD) | Super saiyan hair effect. Separate R&D. |

## Phase 2b batch overview

| Batch | Title | Reqs |
|-------|-------|------|
| B1 | Segmentation foundation + blur mode | R18 |
| B2 | 5 generic backgrounds + picker UI | R19 |
| B3 | Custom background upload | R20 |
| B4 | Mobile opt-in warning | R21 |
| B5 | E2E + final gate | R22 |

## Scope boundary

**IN:** new `background-effects.service.ts`, picker UI in lobby + in-call controls, asset bundle, mobile gate, e2e specs.

**OUT:** country-themed art (Phase 2c), super saiyan (Phase 3), backend storage of uploads (Phase 2b is local-only).
