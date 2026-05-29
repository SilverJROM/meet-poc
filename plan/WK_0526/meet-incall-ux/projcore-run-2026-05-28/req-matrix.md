# Req coverage matrix — In-call UX run (Phase 1) — FINAL

| Req# | Requirement (verbatim, first 80 chars) | Batch | Evidence | Status |
|------|---------------------------------------|-------|----------|--------|
| R1 | Record button is host-only in controls-bar | A | validation/A-ui-polish.md + controls-bar @if(isHost()) + toggleRecording() guard | **VERIFIED** |
| R2 | Remove diagnostics buttons (both) from in-call controls-bar | A | validation/A-ui-polish.md | **VERIFIED** |
| R3 | Speaker clickable to mute meeting + combined mic/speaker indicator | B | validation/B-audio-controls.md + setMutedAll() | **VERIFIED** |
| R4 | Volume slider + amplifier (0-130%, persists) | B | validation/B-audio-controls.md + setVolume()+persistVolume() | **VERIFIED** |
| R5 | Screen-share approval flow (host approves non-host) | C | validation/C-share-and-reactions.md + share-approval.spec.ts | **VERIFIED** |
| R6 | Reactions (raise hand persistent + thumbs/clap/heart transient) | C | validation/C-share-and-reactions.md + reactions.spec.ts | **VERIFIED** |
| R7 | Direct 1:1 chat with per-recipient tabs | D | validation/D-direct-chat.md + chat-direct.spec.ts + chatThreads Map | **VERIFIED** |
| R8 | Admit-all button when knockers ≥ 2 | A | validation/A-ui-polish.md + banner-toast.spec.ts | **VERIFIED** |
| R9 | Knock banner → small top-right toast | A | validation/A-ui-polish.md + screenshot | **VERIFIED** |
| R10 | Phase 1 test gate (all builds + e2e green) | All | 13/13 e2e PASS on commit 7edcd9b deployed | **VERIFIED** |

**ALL 10/10 reqs VERIFIED.**

## Batch summary
| Batch | Reqs | Commit | e2e |
|-------|------|--------|-----|
| A | R1, R2, R8, R9 | `657b568` | 8/8 |
| B | R3, R4 | `07f18a8` | 8/8 |
| C | R5, R6 | `227d0f1` | 12/12 (+share-approval, +reactions) |
| D | R7 | `7edcd9b` | 13/13 (+chat-direct) |

## Phase 2 backlog (separate run)
- R11 background blur + 5 generic + 10+ country-themed/anime-style original art
- R12 per-user custom background upload

## Phase 3 (TBD)
- R13 super saiyan hair effect (R&D, separate effort)
