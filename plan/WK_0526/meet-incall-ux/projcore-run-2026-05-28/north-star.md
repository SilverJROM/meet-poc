# North-Star — In-call UX run (Phase 1)

**Date:** 2026-05-28
**Pattern:** 2 — codex-in-tmux
**OVM session:** `lkvc-38-audio-fix`

## Locked decisions

| # | Decision | Answer |
|---|----------|--------|
| D1 | Sequencing | Phase 1 (this run) = in-call UX. Phase 2 = blur + generic backgrounds (later). Phase 3 (anime-style country-themed + super saiyan) = TBD, discuss after Phase 2. |
| D2 | Knock banner | Persists until admit/reject/cancel. Small top-right card (not full-width banner). |
| D3 | Direct chat | Per-recipient tabs in chat: `Everyone`, `@<name>` per peer. Click tab to switch context. |
| D4 | Backgrounds licensing | Country-themed (Japan, PH, etc.) anime-STYLE ORIGINAL/royalty-free art. NO branded DBZ/Samurai-X/etc. assets. |
| D4a | Custom background upload (Phase 2 add-on) | Each user can upload their own custom background image. Stored client-side (localStorage data URL) by default; backend upload only if shared across team. Default scope: per-user local. |
| D5 | Record button | Already host-only per code. Verify visually + leave alone unless visible to non-hosts. |
| D6 | Diagnostics buttons | Remove BOTH from controls-bar (host AND non-host). Keep backend `/api/meeting-sessions/diagnostics` logging. Keep `/app/diagnostics` page (admin/debug surface, not in-call). |
| D7 | Speaker mute | Speaker icon clickable → mutes ALL incoming audio (via remote-audio mixer). Show muted state. If BOTH mic + speaker muted → maybe combined indicator (TBD in detailed brief). |
| D8 | Volume + amplifier | Slider 0–130% (1.3 max gain). Default 100%. Boosts beyond 100% for weak phone speakers. |
| D9 | Screen-share approval | Guest requests, host approves/denies. Host's own share doesn't need approval. |
| D10 | Reactions | Raise hand = persistent state (until lowered). Thumbs up + other reactions = transient floating animation, auto-dismiss after ~3s. |
| D11 | Admit-all | Button visible when `knockers().length >= 2`. Loops admit. |
| D12 | Test gate | Build + e2e regression suite (all existing tests must still pass) + new specs per feature where feasible. |
| D13 | Commits | One commit per atomic sub-batch. Stack on `fix/sfu-audio-publish-guard`. |

## Phase 1 batches

| Batch | Title | Key files |
|-------|-------|-----------|
| A | UI polish: remove diagnostics buttons, knock-banner toast, admit-all | `controls-bar.component.{ts,html,scss}`, `room.page.{ts,html,scss}` |
| B | Audio: speaker mute + volume slider + amplifier | `remote-audio.service.ts`, `controls-bar.component.{ts,html}`, `room.page.{ts,html}` |
| C | Screen-share approval + reactions | `signaling/index.ts`, `ws.service.ts`, `room.page.{ts,html}`, new `reaction.component.ts` |
| D | Direct chat with per-recipient tabs | `signaling/index.ts`, `ws.service.ts`, `room.page.{ts,html}`, chat model refactor |

Each batch ships independently. After D, declare Phase 1 done. Phase 2 (backgrounds) is a fresh run.

## Scope boundary

**IN:** in-call control surface, signaling for new message types, UI polish.
**OUT:** background blur (Phase 2), virtual backgrounds (Phase 2), super saiyan (Phase 3), anime art licensing (Phase 3).
