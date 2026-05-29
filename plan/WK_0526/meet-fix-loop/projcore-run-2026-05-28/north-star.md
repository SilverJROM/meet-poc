# North-Star — Fix-loop Run
**Run:** projcore-run-2026-05-28 (fix-loop)
**Date:** 2026-05-28
**Lifecycle:** pre-live (deferral OFF)
**Pattern:** 2 — codex-in-tmux (`lkvc-38-audio-fix` parent, `lkvc-38-audio-fix-codex` child)
**OVM workflow:** wf=6
**JROM authority:** "full authority to try your fix and test it until it works"
**JROM presence:** away for ~couple hours, no questions until return

---

## Locked decisions

| # | Decision | Answer |
|---|----------|--------|
| D1 | What is the actual "CONNECTING stuck" issue? | Post-audio-fix diagnostics (session d216b499, room 180cce4e7f73) show tracks flowed both ways: JROM↔Joanne audio + video bytes increasing, subscribe latency 1.9s, total CONNECTING window ~5.1s. The audio fix (B1+B2 from prior run) WORKED. JROM saw the natural ~5s SFU subscribe window and reported it as broken. |
| D2 | What to ship for "CONNECTING" anyway | (a) Trim B1's audio-publish poll cap 5s → 1.5s (audio is normally live within 100ms after lobby preflight; 5s is overcautious). (b) Add a subscribe-stuck warning at 10s with diagnostics dump so a *real* permanent stuck state would be detectable next time. |
| D3 | Name-when-knocking UX | **Prominent banner toast** at top of in-call view: `<Name> wants to join` with inline `Admit` / `Reject` buttons. JROM's verbatim choice. |
| D4 | Test gate | `cd frontend && ng build` 0 errors + `cd backend && npm run build` 0 errors + 2-browser DEV smoke (host + guest in TEST_ROOM01 `3f324d8be763`). |
| D5 | Implementer / Validator | Codex implements via tmux child `lkvc-38-audio-fix-codex`. Claude (this session) validates via build + DEV deploy + 2-browser smoke. Verifier ≠ fixer. |
| D6 | Lifecycle | pre-live — deferral OFF. No TODOs, no deferred cleanup. |
| D7 | Stop policy | Loop until fixes validated. After 3× batch fail, NEEDS-INFO to OVM (JROM tracks there). No chat questions while JROM is away. |
| D8 | Commits | One commit per batch on `main`. Format: `fix(<area>): <description>`. |
| D9 | Follow-on | After fix-loop validated, immediately kick off the planned `meet-features` 8-batch run at `plan/WK_0526/meet-features/projcore-run-2026-05-28/`. |
| D10 | Test room | Persistent TEST_ROOM01 (slug `3f324d8be763`) — cleanup not required (per memory `feedback_test_pollution_cleanup.md`, persistent room is exempt). |

---

## Scope boundary

**IN:**
- `frontend/src/app/pages/room/room.page.ts` (admitted handler poll cap; knock handler banner trigger)
- `frontend/src/app/pages/room/room.page.html` (knock banner template block)
- `frontend/src/app/pages/room/room.page.scss` (banner styles, animation)
- `frontend/src/app/services/sfu-client.service.ts` (subscribe-stuck timeout warning)

**OUT:**
- Backend changes (knock message already carries `name`)
- Guest-join flow (covered by meet-features run)
- UI redesign of sidebar/waiting room (covered by meet-features R10)
- In-call UI other than the banner toast

---

## Evidence cache
- Diagnostics session `d216b499-c4df-4d71-9366-9d26d96d6781`:
  - JROM inbound from Joanne: 62KB+ audio, 227KB+ video, 0 packets lost
  - Joanne inbound from JROM: 39KB+ audio
  - subscribeLatencies: initiatedAtMs=1779939207039, firstFrameAtMs=1779939208944, latencyMs=1905
  - Pre-subscribe gap: 2.93s (Joanne admit → JROM subscribe initiate)
- B1 commit: `eb1efe8` (5s poll in admitted IIFE)
- B2 commit: `758f0ed` (mixerEnabled() → true for all platforms)
