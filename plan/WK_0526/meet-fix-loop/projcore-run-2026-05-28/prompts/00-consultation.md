## Consultation — fix-loop plan review

You are codex acting as the implementer for projcore's fix-loop run. **Read these files first**, in this order:

1. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/north-star.md` — locked decisions, evidence cache
2. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/og-requirements.md` — R1–R6 contract
3. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/implementation-plan.md` — B1, B2, B3 plan
4. `frontend/src/app/pages/room/room.page.ts` — focus on lines 737–760 (admit/reject), 977–987 (knock handler), 944–966 (admitted IIFE)
5. `frontend/src/app/pages/room/room.page.html` — focus on lines 40–115 (call-panel notices area)
6. `frontend/src/app/services/sfu-client.service.ts` — focus on lines 81–101 (subscribeIfNeeded), 586–613 (pc.ontrack), 504–566 (resetForReconnect)
7. `frontend/src/app/components/participant-sidebar/participant-sidebar.component.html` — existing knocker rendering for reference

## What I need from you

**Do NOT write any code yet.** Respond ONLY in this format:

```
STATUS: AGREE
or
STATUS: PROPOSE-CHANGES

If PROPOSE-CHANGES, list each change as:
- File: <path>
  Change: <what>
  Why: <reason — must be concrete, not stylistic>
```

Things I specifically want you to check:

1. **B1 banner placement** — I suggested injecting the `@if (isHost() && knockers().length > 0)` block inside `<section class="call-panel">` near lines 91–115. Is there a better location? Does the share-layout (`shareLayoutActive()`) hide that area? Should the banner live outside `.call-content` so it stays visible during screen-share layout?

2. **B1 mobile sidebar interaction** — On mobile, the participant sidebar is a slide-up sheet with `section-tabs` for "In the call" / "Waiting". Could the banner conflict with that? Should it be hidden on mobile when the sidebar is already open?

3. **B2 subscribe-stuck watchdog** — Arming inside `subscribeIfNeeded` (line 100) is what I sketched. But `subscribeIfNeeded` returns early on `!publisher.tracks.length`, on `cfSessionId === self`, and on already-subscribed. The arm should only happen on the path where `enqueue(doSubscribe)` is actually called. Confirm my arm point covers exactly that case.

4. **B2 disarm in pc.ontrack** — In `pc.ontrack` (sfu-client.service.ts:586), `subscribeFirstFrameAt` is set on the FIRST track per publisher (line 591–593 `if (!has) set`). I want to disarm the watchdog at the same point — only the first time a track arrives for a publisher. Confirm this is correct, and confirm cleanup in `resetForReconnect` (line ~514).

5. **R5 poll cap 1.5s** — Is 1500ms safe? The audio track should be live from lobby preflight. Is there any code path that ends/replaces the audio track between `join()` and `admitted` arriving? `ensureSelectedAudioDevice` calls `reacquire` which would replace the stream. If `admitted` arrives during a reacquire, would the new stream's audio track still be 'live' fast enough for 1.5s? Reason about this.

6. **Cross-cutting** — Any concern about commit hygiene, single-commit-per-batch, or test scope?

Report back with STATUS: AGREE or STATUS: PROPOSE-CHANGES. Be concrete. Once I get your reply I'll greenlight B1 implementation.
