# Progress log — Phase 2b

| ISO time | Event |
|----------|-------|
| 2026-05-28T10:55:00Z | Phase 2b plan locked. 5 batches B1-B5 covering R18-R22. North-star written with 10 locked decisions. |
| 2026-05-28T10:55:30Z | Phase 0 frontloaded interview complete: MediaPipe Selfie Segmentation, mobile opt-in with warning, projcore-supplied royalty-free assets, localStorage upload. |
[overmind] 2026-05-28T10:54:31+00:00 register OK label=VOICE App · Phase 2b — background effects (blur + 5 generic + custom upload) parent=lkvc wf=6 children=["lkvc-codex"]
[overmind] 2026-05-28T10:55:55+00:00 sync OK current='Segmentation foundation + blur mode (R18)' tasks=11
| 2026-05-28T10:58:00Z | B1 dispatched to lkvc-codex; mandatory PROPOSED handshake before code |
| 2026-05-28T11:04:00Z | B1 STATUS: PROPOSED — MediaPipe selfie_segmentation, effectiveLocalStream signal, processStream API. Risks named: SFU renegotiation queue, camera flip, screen share path. Acceptance: composite track ≠ raw + replaceVideoTrack exactly once on transition. APPROVED-PLAN sent. |
| 2026-05-28T11:24:30Z | B1 codex commit 5cdb0af landed: feat(bg): segmentation foundation + blur mode (R18). 11 files, 410 LOC, MediaPipe@0.1.1675465747 added. |
| 2026-05-28T11:25:00Z | B1 codex STATUS: DONE. Self-validation evidence: backend build PASS, ng build PASS, two-browser join PASS (guest received live blurred host video), e2e fixloop-banner 16/16 PASS, blur-preview screenshot saved. |
| 2026-05-28T11:30:00Z | B1 projcore independent validation: backend `npm run build` PASS, frontend `ng build` PASS (only known warnings). Code review of room.page.ts wiring confirms single-source-of-truth `effectiveLocalStream` signal + `lastSfuVideoTrack` debouncer for exactly-once replaceVideoTrack. R18 → VERIFIED. |
[overmind] 2026-05-28T11:28:19+00:00 register OK label=VOICE App · Phase 2b — background effects (blur + 5 generic + custom upload) parent=lkvc wf=6 children=["lkvc-codex"]
| 2026-05-28T11:30:30Z | Context-handoff written. /clear issued to lkvc-codex. Fresh session confirmed. |
| 2026-05-28T11:30:45Z | B2 dispatched to lkvc-codex. Brief at prompts/B2-picker-ui.md. No PROPOSED handshake (UI batch). Scope: 5 CC0 assets + picker component + lobby & in-call integration + localStorage persistence. |
| 2026-05-28T11:43:10Z | B2 codex commit f6f8714 landed: feat(bg): 5 generic backgrounds + picker UI (R19). 17 files, 640 LOC. Chose Option C (generated SVG, CC0 by author) for assets. |
| 2026-05-28T11:43:30Z | B2 codex STATUS: DONE. Self-validation: backend+frontend builds PASS, e2e fixloop-banner 16/16 PASS, two screenshots saved. |
| 2026-05-28T11:46:00Z | B2 projcore independent validation: ng build PASS, diff confirms temp B1 toggle FULLY removed (devModeBgBlur signal + togglePreviewBlur method + HTML+SCSS), picker component standalone + keyboard-accessible + localStorage-persistent, lobby+in-call screenshots show selection ring + 7 tiles + wand-icon overlay close. R19 → VERIFIED. NOTE: SVG assets are stylized vector art; JROM may want to swap to real CC0 photos in follow-up micro-fix (picker accepts any URL via setBackgroundImage). |
| 2026-05-28T11:47:30Z | Context-handoff updated for B3. /clear issued to lkvc-codex. Fresh session confirmed (token usage reset). |
| 2026-05-28T11:48:00Z | B3 dispatched to lkvc-codex. Brief at prompts/B3-custom-upload.md. No PROPOSED. Scope: extend picker with upload tile + canvas resize pipeline + FIFO localStorage (5 max) + restore. Touches only background-picker.component.{ts,html,scss}. |
| 2026-05-28T11:52:50Z | B3 codex commit fb91c46 landed: feat(bg): custom background upload (R20). 3 files, 356 insertions. Constants match brief (max 5 customs, 10MB upload, 1MB processed, JPEG ladder 0.85-0.5). FIFO eviction, defensive readCustomBackgrounds, delete-selected fallback to 'none'. |
| 2026-05-28T11:53:30Z | B3 codex STATUS: DONE. Browser smoke PASS per codex (upload tile, reload restore, sixth-upload FIFO, delete-selected fallback). BUT codex skipped acceptance gate items 3+4: no validation/B3-custom-upload.md, no validation/B3-picker-with-customs.png. |
| 2026-05-28T11:54:00Z | B3 REVISE-1 dispatched: 2-gap correction (write validation doc, capture screenshot). No code changes. Separate commit. Per projcore §1.3.4 role-boundary HARD RULE. |
| 2026-05-28T11:55:30Z | B3 rev1 codex commit a59043a: docs(bg): B3 validation evidence (R20). 2 files (validation/B3-custom-upload.md 2KB + B3-picker-with-customs.png 46KB 540×350). STATUS: DONE — B3 revision 1 complete. |
| 2026-05-28T11:56:00Z | B3 projcore independent validation: code (commit fb91c46) mechanism-correct (constants match brief, FIFO+restore+delete-fallback clean). Validation MD documents resize ladder + FIFO + restore + error handling. Screenshot shows 7 presets + Custom 1 tile w/ × delete button + Upload+ tile, Custom 1 has blue selection ring. ng build PASS. R20 → VERIFIED. |
| 2026-05-28T11:57:00Z | Context-handoff updated for B4. /clear issued to lkvc-codex. Fresh session. |
| 2026-05-28T11:57:30Z | B4 dispatched. Brief at prompts/B4-mobile-optin.md. Tightest batch yet: ViewportService injection + verbatim warning + default-off-on-mobile via meet-poc:bg:mobile-opt-in flag. Touches only picker component. |
| 2026-05-28T12:01:28Z | B4 codex commit 0469f64 landed: feat(bg): mobile opt-in warning (R21). 6 files (3 component + MD + 2 screenshots), 85 insertions atomic. Verbatim warning text in @if(isMobile()) block; initialSelectedId() pure helper; mobile-opt-in flag written on first non-None mobile selection. |
| 2026-05-28T12:02:00Z | B4 codex STATUS: DONE. Self-validation per codex: builds PASS, e2e PASS, smoke for desktop-no-warning + mobile-warning + mobile-default-off + opt-in-persistence. Screenshots saved in same commit (learned from B3 rev1 — no separate docs commit needed). |
| 2026-05-28T12:03:00Z | B4 projcore independent validation: code review confirms ViewportService injected as signal ref, restoreSelection early-return on mobile-no-opt-in, select() writes opt-in flag, desktop behavior unchanged. Mobile screenshot shows yellow warning banner verbatim text + None selected. Desktop screenshot shows no warning + Blur selected. R21 → VERIFIED. |
| 2026-05-28T12:03:45Z | Context-handoff updated for B5 (final). /clear issued. |
| 2026-05-28T12:04:00Z | B5 FINAL dispatched. Brief at prompts/B5-test-gate.md. Scope: NEW e2e/tests/background-effects.spec.ts asserting composite-stream-in-use via window.__meetDebug; 4-gate run (backend build + ng build + fixloop-banner 16/16 + new spec 1/1). Test rooms MUST be cleaned post-spec per JROM standing instruction. |
| 2026-05-28T12:13:00Z | B5 codex commit 1e55bd6 landed: test(bg): playwright spec for composite stream + R22 gate (R22). Single atomic commit, spec + MD only. Codex SQL-verified room cleanup (0 rooms with prefix). |
| 2026-05-28T12:13:30Z | B5 codex STATUS: DONE. 4 gates per codex: builds + fixloop-banner 16/16 + background-effects 1/1 in 4.6s. JROM manual smoke documented as out-of-scope. |
| 2026-05-28T12:14:00Z | B5 projcore independent validation: re-ran new spec — 1 passed (4.7s), matches codex's claim. Spec uses existing fixtures + triple-cleanup pattern (beforeEach+afterEach+finally) + addInitScript localStorage reset + both-direction track-id assertions. Validation MD complete with 4-gate table + phase summary. R22 → VERIFIED. |
| 2026-05-28T12:14:30Z | PHASE 2B RUN COMPLETE. All 5 requirements R18-R22 VERIFIED. 6 commits on feat/share-persistence-mobile-revoke-20260528: 5cdb0af (R18) + f6f8714 (R19) + fb91c46 (R20) + a59043a (R20 docs) + 0469f64 (R21) + 1e55bd6 (R22). Ready for JROM manual smoke; Phase 2c (country-themed art) and Phase 3 (super saiyan hair) remain separate runs. |
[overmind] 2026-05-28T11:30:42+00:00 sync OK current='5 generic backgrounds + picker UI (R19) — dispatched 2026-05-28T11:30Z' tasks=11
[overmind] 2026-05-28T11:46:59+00:00 sync OK current='Custom upload (R20) — dispatched 2026-05-28T11:48Z' tasks=11
[overmind] 2026-05-28T11:57:57+00:00 sync OK current='Mobile opt-in warning (R21) — dispatched 2026-05-28T11:57Z' tasks=11
[overmind] 2026-05-28T12:04:24+00:00 sync OK current='E2E + final gate (R22) — dispatched 2026-05-28T12:04Z' tasks=11
[overmind] 2026-05-28T12:13:47+00:00 complete OK session=lkvc
