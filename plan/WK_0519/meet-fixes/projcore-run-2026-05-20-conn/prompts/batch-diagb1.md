Batch-DIAGB1: Lobby + pre-join cluster (DR-6 quick-join, DR-7 validation, DR-9 live-knocker bug, DR-10 doorbell)

Batch ID: diagb1
Requirements: DR-6, DR-7, DR-9, DR-10 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md — READ THEM)
Branch: continue on fix/meet-conn-diag (current tip; carries Batch A + diag1cf). Do NOT branch off master.

**Protocol: projcore v2.0.**
1. **Plan handshake BEFORE code** — reply STATUS: PROPOSED first; wait for projcore APPROVED-PLAN before implementing.
2. **Callback discipline** — final action of every STATUS reply: append `[projcore callback] diagb1 <STATE> <one-line note>` to plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/callbacks.md. End every reply with `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.

## Why this cluster

All four touch the JOIN flow (pre-join screen + lobby/knock). JROM is hitting friction here during real testing: full device-test every join, silent empty-name failures, can't-see-knockers-without-refresh, and no audible alert when someone wants in.

## Requirements (summary — verbatim in og-requirements.md)

- **DR-6 Quick-join with self-preview.** Default pre-join = Meet/Zoom-style: small self-view + name + cam/mic toggles + Join, using the user's default/last-used devices automatically. Full device-test panel (preview + mic VU + speaker test + device dropdowns — the FIXC2 component) hidden behind a "Test / configure devices" expander (opt-in). JROM picked this layout via mockup. **Reuse the existing FIXC2 device-dialog component** — present it collapsed by default, expand on the link. Persist chosen devices (FIXC2 already does localStorage).
- **DR-7 Pre-join validation + clear errors.** (a) Empty/whitespace-only name → on Join attempt show inline human-readable error ("Enter your name to join") + focus the name field; also disable the Join button with a hint until a name is present (no silent no-op). (b) Every blocking pre-join condition (camera/mic permission denied, no devices, ice-config fetch failure, media acquisition error) shows a clear specific message + how to fix. Build on existing lobby permission-denied copy (v2-b7).
- **DR-9 Live waiting-to-join (knocker) updates — BUG.** Host can't see people waiting to join unless they refresh + reopen the call. Diagnose why the knock/peer-waiting WS event doesn't update the knockers signal reactively when the knock arrives AFTER the host is already in-call. Fix so new knockers appear live. (Investigate: is the host subscribed to knock broadcasts post-join? Is the signal updated on the WS message? Is there a room-state-resync gap?)
- **DR-10 Subtle doorbell on join request.** When someone knocks/requests to join, play a subtle WebAudio chime to those who can admit (host + co-hosts) only — NOT to regular participants. Subtle (low gain, short), debounce rapid repeats, respect mic-muted / a notifications-off state if present. Generate via WebAudio (like the FIXC2 speaker-test tone) or a tiny committed asset. Pairs with DR-9 (same knock event).

## Observed (confirm by reading)

- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — the lobby/pre-join state machine (`state()` = lobby/call/etc.), the `knockers` signal, join handler, name field, FIXC2 device-dialog integration (lobbyDeviceDialogOpen, prepareLobbyDeviceCheck), DR-1/FIXC2 `manualDeviceSetup` query param.
- `frontend/src/app/components/device-dialog/device-dialog.component.*` — the FIXC2 panel to present collapsed.
- `frontend/src/app/services/ws.service.ts` — knock/peer-waiting message handling (for DR-9).
- backend signaling/rooms modules — how knock/admit + the waiting list are broadcast; whether a host joining mid-session gets the current knocker list + subsequent knock events (DR-9 root cause likely here OR in the frontend handler).
- existing knocker e2e: `e2e/tests/v2-b8-sidebar/` (S8.1 waiting knockers) — extend for the after-join timing.

## Scope

- Implement DR-6, DR-7, DR-9, DR-10 ONLY.
- Do NOT touch DR-1/DR-2/DR-3 (that's Batch B2, next) or DR-4/DR-5/DR-8 (done/deployed).
- Do NOT regress FIXC2 device-test (you're re-presenting it collapsed, not removing it) or the FIXC1 camera-light fix.
- Surgical, join-flow-only.

## Plan handshake (MANDATORY)

1. Read this brief + og-requirements.md DR-6/7/9/10 + the referenced files.
2. STATUS: PROPOSED with: mechanism read of the current lobby/knock flow + WHY knockers don't update live (DR-9 root cause — name the actual gap), per-DR plan, planned files, risks, and whether DR-9 needs a backend change (knock broadcast / mid-session room-state sync) or is purely frontend.
3. Append callback. Wait for APPROVED-PLAN.
4. After approval: implement, COMMIT BEFORE STATUS: DONE.

## Tests

- DR-6: pre-join shows self-preview + name + toggles + Join WITHOUT the full dropdowns/VU visible; clicking "Test / configure devices" expands the FIXC2 panel; device choice persists.
- DR-7: click Join with empty name → inline error + Join blocked + field focused; stub getUserMedia denial → clear permission error.
- DR-9: host in call; a SECOND client requests to join AFTER host is in-room → host's waiting list updates WITHOUT reload. (This is the key regression-proof — make the timing explicit.)
- DR-10: knock event → assert chime fires (debug counter) for host; assert it does NOT fire for a non-admitting participant.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagb1/

changes.md (User Report verbatim + DR-9 root-cause mechanism + per-file WHY), scenarios.md, review.md, test-report.md, screenshots/{quick-join.png, quick-join-expanded.png, empty-name-error.png, live-knocker.png}, independent-validation.md, decisions/<date>-*.md per §1.15 (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; Run-1 regression (current 69-spec set + new specs) PASS — R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.
- Live smoke: open a room → see quick-join (collapsed device test); empty-name → error; second client knocks while you're in-call → appears live + doorbell.

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` AND append `[projcore callback] diagb1 DONE <note>` to callbacks.md as the final action.
