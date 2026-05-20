Batch-DIAGF: Connection resilience — silent reconnect, no ghost tiles, host auto-admit, disconnect grace (DR-18/19/21/22)

Batch ID: diagf
Requirements: DR-18, DR-19, DR-21, DR-22 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diagf <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

## THE CORE PROBLEM (all four DRs share one root cause)

Real-device evidence (screenshot tmp/App_voice_issue01.jpeg): a 6-tile grid for 2 people — 4 dead "jrom"/HOST tiles badged FAILED/DISCONNECTED. Every host drop+reconnect spawned a NEW clientId → new tile → old one lingered as a ghost, AND the host was re-asked to be admitted. So: **reconnect creates a new identity instead of resuming the old one.** The DR-3 admitted-guest reconnect token (2-min, diagb2) exists but is NOT firing on these real drops. Fix the whole reconnect/disconnect/identity/tile lifecycle.

## Requirements

- **DR-18 — Silent sticky reconnect (no re-admit).** Previously-ADMITTED peer drops → within a 1-2 min grace window, the client auto-reconnects WITHOUT re-admission and WITHOUT spawning a new tile/identity. Investigate + fix why the DR-3 token isn't presented/honored on real WS drops (is the client persisting + re-sending the token? does the reconnect path hit the resume branch? does a new clientId bypass it?). Make resume work end-to-end on real drops.
- **DR-19 — No ghost tiles.** On reconnect, keep the SAME tile (frozen last frame) and resume underneath — never a second tile for the same returning user. FAILED/DISCONNECTED peers beyond the grace window (or explicit leave) are REMOVED. Grid shows only current participants (+ at most one frozen 'reconnecting' tile per user within grace).
- **DR-21 — Host/owner auto-admit on reconnect.** A reconnecting room OWNER (auth = owner_email) is ALWAYS auto-admitted into their own room — never knocking/pending, unconditional (ownership, independent of token). (Non-owner admitted guests resume via the DR-18 token.)
- **DR-22 — Disconnect grace/tolerance.** On `iceConnectionState`/`connectionState` → `disconnected` (often self-heals), do NOT immediately teardown — enter a ~15-20s recovering state: keep the tile (frozen) + keep audio, attempt silent ICE-restart (DR-4) + WS-reconnect (DR-3/DR-18). Only declare a real disconnect if not recovered within grace, then DR-19 cleanup. Debounce so a single transient `disconnected` never escalates. Also review the mobile background/visibility-pause path so screen-lock/backgrounding doesn't force a hard disconnect.

## Observed (confirm by reading — name the exact gaps)

- `backend/src/modules/signaling/index.ts` — the DR-3 reconnect token (issueReconnectToken, reconnectTickets, canResume), admit/knock flow, owner detection, peer-leave broadcast. WHY isn't the token honored on real drops? Is the OWNER path missing an auto-admit?
- `frontend/src/app/services/ws.service.ts` — WS reconnect/backoff (DR-3), whether the reconnect token is persisted + re-sent on the reconnect join, the new-clientId behavior.
- `frontend/src/app/services/webrtc.service.ts` — connection/ice state listeners (DR-2/DR-4), restartIce (DR-4), peer add/remove, tile/peer map. Where does a disconnected peer get removed (ghost source)? Where does the grace period belong?
- `frontend/src/app/pages/room/room.page.ts` — peer→tile rendering, admit/knock UI, the reconnect handling, mobile visibility-pause.

## Scope

- DR-18/19/21/22 only — the reconnect/disconnect/identity/tile lifecycle + grace.
- Do NOT regress DR-1..DR-17, DR-20, the FIXC work, or the TURN/ICE-restart fixes.
- Audio must never be dropped during grace (per DR-11/DR-13).
- Surgical to the connection-lifecycle code.

## Plan handshake (MANDATORY — JROM wants a solid agreed plan)

STATUS: PROPOSED with: the ROOT-CAUSE diagnosis (name exactly why the DR-3 token isn't firing + why reconnect makes a new identity + where ghosts come from), the per-DR mechanism (token persist+resend, owner auto-admit branch, tile-freeze+resume, grace-state machine + thresholds + debounce, mobile-pause review), planned files, risks, and whether any backend protocol change is needed. Append callback. Wait for APPROVED-PLAN.

## Tests

- DR-18: admitted guest drops + reconnects within grace → resumes, no re-admit, single peer entry (no duplicate).
- DR-19: drop+reconnect → tile count correct (no duplicate, no FAILED/DISCONNECTED ghost); explicit leave → tile removed.
- DR-21: OWNER drops + rejoins → enters as host directly, no admit prompt, no knocking.
- DR-22: transient ice `disconnected` that recovers → no teardown, no tile loss, no re-admit, audio preserved; `disconnected` exceeding grace → clean disconnect + cleanup.
- Audio-never-dropped assertion holds through all.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagf/

changes.md (root-cause mechanism + per-file WHY), scenarios.md, review.md, test-report.md, screenshots/{reconnect-no-ghost.png, grace-recovering.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; full Run-1 + diag specs PASS on a CLEAN/isolated DB (live-DB data-seed specs have a known FK/WAL flake — validate on clean DB). R8.1 must hold.
- pm2 restart meet-poc-fe meet-poc-be.
- Clean up any test rooms you create (keep TEST_ROOM01).

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diagf DONE <note>` to callbacks.md.
