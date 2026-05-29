# OG Requirements — In-call UX run (Phase 1)
**Created:** 2026-05-28
**Source:** JROM chat (verbatim) — feature dump 2026-05-28 ~09:30
**Lifecycle:** pre-live (deferral OFF)
**Run:** projcore-run-2026-05-28 (in-call UX)

## Background
JROM listed 11 in-call UX feature requests + a follow-up (custom background upload). Phase 1 covers the in-call functional/UX features (R1-R10). Phase 2 = background effects (R11-R12, separate run). Phase 3 = super saiyan (R13, TBD).

## Phase 1 — Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R1 | Record button is **host-only** in controls-bar. Non-host never sees it. | Code review: `@if (isHost())` wraps record button. Verified visually in 2-browser test (host sees, guest doesn't). |
| R2 | Remove **diagnostics** buttons (both "Show diagnostics" and "Show meeting info") from in-call controls-bar for host AND non-host. **Keep** backend diagnostic logging to `meeting_session_diagnostics`. **Keep** `/app/diagnostics` admin page (out of in-call scope). | Code review: diagnostics buttons absent from controls-bar.html. Backend `flushDiagnosticsLog` / `queueDiagnosticsLog` still active. `/app/diagnostics` page still routable. |
| R3 | **Speaker icon clickable to mute incoming audio** (via remote-audio mixer). When clicked again, unmutes. Shows muted state visually. If BOTH mic + speaker muted, show combined indicator on local self-view. | Click speaker → all peer audio muted (mixer gain → 0). Click again → unmuted. Mute icon flips. Both-muted indicator visible. |
| R4 | **Volume slider + amplifier** (0-130%, default 100%). 100% mark visible. Above 100% labeled "amp". Persists in localStorage. | Slider adjusts mixer gain in real time. 130% visibly louder than 100%. Volume preserved across browser sessions. |
| R5 | **Screen-share approval flow** for non-hosts. Guest clicks share → request sent to host. Host gets toast with Allow/Deny. On Allow, guest proceeds. On Deny, guest sees notice. Host's own share doesn't need approval. | Non-host triggers share → host sees approval toast → host clicks Allow → guest captures and publishes screen. Deny path also functional. |
| R6 | **Reactions**: raise hand (persistent state until lowered), thumbs up + clap + heart (transient ~3s animation). | Reactions button in controls-bar. Raise hand shows persistent badge on tile. Transient reactions float up + fade. WS broadcasts to all peers. |
| R7 | **Direct (1:1) chat** with per-recipient tabs in chat panel: "Everyone", "@peer1", "@peer2". Unread badge per tab. | Chat tabs visible. Send to "@peer1" → only that peer + sender see message. "Everyone" remains broadcast. Unread counts track per-tab. |
| R8 | **Admit-all button** in knock toast stack when knockers ≥ 2. Loops `admit` for each pending knocker. | Button visible when 2+ guests waiting. Click admits all of them. |
| R9 | **Knock banner → small top-right toast**. Persists until admit/reject/cancel (no timeout). Replaces the current full-width blue banner. | Toast appears top-right (`.knock-toast-stack` positioned `fixed`). Banner no longer full-width. Existing banner-toast e2e specs updated to use new selectors. |
| R10 | Phase 1 test gate: `cd backend && npm run build` + `cd frontend && ng build` + e2e suite (`fixloop-banner/`) — all green. New playwright specs for share-approval, reactions, chat-direct, camera-toggle (already exists). | All builds pass, all specs pass. |

## Phase 2 (separate run)

| ID | Requirement | Notes |
|----|-------------|-------|
| R11 | Background blur + 5 generic backgrounds + 10+ country-themed/anime-style original art backgrounds | MediaPipe Selfie Segmentation. Anime-STYLE original art, NOT branded DBZ/etc. (D4 in north-star). Performance budget mobile. |
| R12 | **Per-user custom background upload** | localStorage data URL by default. Backend upload OUT of scope for Phase 2; would be its own follow-up. |

## Phase 3 (TBD)

| ID | Requirement | Notes |
|----|-------------|-------|
| R13 | Super Saiyan hair effect | Hair-specific segmentation + glow/particle shaders. Separate R&D effort. JROM agreed: "lets talk about it later". |

## Out of scope
- Mockup/UI redesign of any non-controls element.
- Backend changes beyond signaling additions for new message types.
- Recording flow changes.
- Hardened audio path (recorder, active-speaker) — purely defensive review.
