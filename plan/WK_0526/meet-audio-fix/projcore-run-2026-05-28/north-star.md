# North-Star — Meet Audio Silence Fix
**Run:** projcore-run-2026-05-28  
**Date:** 2026-05-28  
**Lifecycle:** pre-live (deferral OFF — every change ships complete in this run)  
**Pattern:** 2 — codex-in-tmux, session `voice`

---

## Mission

Two confirmed call failures (May 26, May 27 23:46) where neither participant heard the other. Investigation confirmed two independent failure modes. This run fixes both, plus a secondary retry-guard bug that would re-surface Failure Mode A in ongoing calls after reconnect.

---

## Design decisions (locked — append-only)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extend Web Audio mixer to ALL platforms (not iOS-only) | `AudioContext.resume()` is permissive post-gesture; one graph survives PC resets; iOS path already proven correct |
| D2 | localStream guard at publish: poll up to 5s, then log + continue | Silent "no-track" publish is the confirmed bug vector; 5s is enough for normal mic init |
| D3 | `subscribedClientIds.clear()` on PC reset | Permanent cap survives PC lifetime; resetting on `resetForReconnect` is correct scope |
| D4 | Commits on `main` (no branch) | pre-live, DEV only, no external consumers |
| D5 | Test gate: `ng build` (0 errors) + manual DEV smoke | Automated audio E2E not feasible headless |
| D6 | Stop policy: NEEDS-INFO to JROM after 3× batch fail | JROM-approved at frontload |

---

## Scope boundary

IN: `remote-audio.service.ts`, `platform.service.ts` (if needed), `room.page.ts` (admitted handler + effect), `sfu-client.service.ts` (subscribeIfNeeded, resetForReconnect)  
OUT: Backend logging (tsx/PM2 issue), TURN config, diagnostics UI, any other module

---

## Test authority

- `ng build --configuration production` in `frontend/` — must pass 0 errors (each batch gate)
- Manual DEV smoke on `https://voice.silverjrom.app` — two browser tabs, same room, verify both-way audio
- No automated audio E2E

---

## Stop policy
- 3× batch fail → NEEDS-INFO to JROM via TG notification
- Batch size >30min non-test → split trigger before dispatch
- Scope questions → NEEDS-INFO relay, not autonomous punt
