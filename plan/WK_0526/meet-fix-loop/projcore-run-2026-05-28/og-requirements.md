# OG Requirements — Fix-loop Run
**Created:** 2026-05-28
**Source:** JROM chat (verbatim)
**Lifecycle:** pre-live (deferral OFF)

---

## Background
JROM reported two issues after the audio-silence fix deploy:
1. "the user joining is just stuck at connecting" — investigated. Diagnostics show the call actually worked end-to-end (~5s natural SFU subscribe window). Polish requested anyway: trim poll, surface real stuck states.
2. "i dont see the name of the user when he joins before admitting" — current behaviour only shows a doorbell + small status text + sidebar count badge. Name is hidden in sidebar (closed by default).

---

## Requirements

### Feature 1 — Name visible when knocking (host UX)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R1 | When a guest knocks (WS `knock` message), the host in-call view MUST show a **prominent banner toast** at the top of the in-call panel displaying `<guest name> wants to join` with inline `Admit` and `Reject` buttons. The host MUST NOT need to open the participant sidebar to see the name or to admit. | Two-browser DEV smoke: host in call, guest knocks → host immediately sees a banner with the guest's display name and two buttons. Clicking `Admit` admits the guest (existing `admit` flow). Clicking `Reject` rejects (existing `reject` flow). |
| R2 | The banner MUST show for each pending knocker. If multiple knockers wait, the banner MUST list them all (stacked) OR the most recent one with a count badge for additional ones. Implementer choice — pick whichever is simpler. | DEV smoke with 2 guests knocking in quick succession → host sees both names (stacked or count). |
| R3 | The banner MUST dismiss automatically when (a) the knocker is admitted, (b) the knocker is rejected, (c) the knocker cancels (WS `knock-cancelled`). | DEV smoke: guest knocks, host admits → banner disappears. Guest knocks, guest cancels → banner disappears. |
| R4 | The banner MUST NOT be shown to non-host participants (they have no admit power). | DEV smoke from guest browser: no banner ever appears. |

### Feature 2 — CONNECTING polish

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R5 | The audio-publish poll cap in the `admitted` IIFE (currently 5000ms in room.page.ts:948) MUST be reduced to **1500ms**. This is sufficient because lobby preflight already establishes a live audio track before `join()` is called, and the rare delayed-permission case won't realistically wait >1.5s either. | Code review: deadline computed from 1500ms not 5000ms. `ng build` 0 errors. |
| R6 | The SFU subscribe path MUST log a warning when a subscribe to a remote publisher has been initiated but no `pc.ontrack` has fired for that publisher within **10 seconds**. Warning MUST include: publisherClientId, initiatedAtMs, elapsedMs, current `subscribedClientIds` set, current `pc.connectionState`, current `pc.iceConnectionState`. This is diagnostic-only (no behavior change), to surface a real stuck state if it ever happens. | Code review: 10s timer wired off `subscribeInitiatedAt` for each publisher; warning fires once per publisher; cleared when first frame arrives. `ng build` 0 errors. |

---

## Out of scope for this run
- Backend changes (knock message already carries the name)
- Guest-join flow (covered by meet-features run)
- Sidebar/waiting room redesign (covered by meet-features R10)
- Any UI other than the banner toast
- Auth/registration flow changes

---

## Acceptance gate
- `cd /home/agjrom/websites/meet-poc/frontend && ng build` — 0 errors
- `cd /home/agjrom/websites/meet-poc/backend && npm run build` — 0 errors (no backend changes expected but build must stay green)
- DEV deploy: `pm2 restart meet-poc-fe`
- 2-browser smoke on `voice.silverjrom.app/room/3f324d8be763` (host) + `voice.silverjrom.app/join/3f324d8be763` (guest): R1, R3 visually verified; R5 verified by ensuring CONNECTING window ≤ 4s end-to-end; R6 verified by reading code (no need to simulate a stuck subscribe in smoke)
