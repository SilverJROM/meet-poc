## Consultation — meet-features run plan review

Context switch: fix-loop is DONE (commits 70d7425, 26fc0d7, 981021a, all on the current branch). We are now starting the meet-features 8-batch run.

**Read these first, in this order:**

1. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-features/projcore-run-2026-05-28/north-star.md` — D1–D11 locked decisions
2. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-features/projcore-run-2026-05-28/og-requirements.md` — R1–R11 contract
3. `/home/agjrom/websites/meet-poc/plan/WK_0526/meet-features/projcore-run-2026-05-28/implementation-plan.md` — B1–B8 plan
4. `backend/src/modules/signaling/index.ts` — focus on lines 639–795 (join handler, name handling, owner detection, admit/knock paths)
5. `backend/src/modules/rooms/index.ts` and `backend/src/modules/rooms/store.ts` — room status, open/close, slug lookup
6. `backend/src/modules/auth/middleware.ts` — what protects which routes (so we know what changes for guest paths)
7. `frontend/src/app/app.routes.ts` — current route table
8. `frontend/src/app/pages/room/room.page.ts` — admitted handler (now post-fix-loop), join() flow, leave() flow
9. `frontend/src/app/pages/rooms/` — host rooms list page (B4 redesign target)

## Locked context from north-star.md
- D1: Guest goes through host-admit lobby (same flow as registered users)
- D2: Guest provides room code + display name on standalone `/join`
- D5: Host leave "Close room" kicks everyone immediately
- D6: Straight to implementation (no mockup phase)
- D7: All 4 host pre-call screens in scope, in-call UI OUT
- D8: Lifecycle pre-live, deferral OFF
- D9: Test gate = `ng build` + backend `npm run build` + manual DEV smoke

## What I need from you

**Do NOT write any code yet.** Respond ONLY in this format:

```
STATUS: AGREE
or
STATUS: PROPOSE-CHANGES

If PROPOSE-CHANGES, list each as:
- Batch: <B1..B8>
- File: <path>
  Change: <what>
  Why: <reason>
```

## Specific questions

1. **B1 backend guest auth** — How is the current WS `join` protected? Read `auth/middleware.ts` and the WS handler entry. Is there a session cookie check before reaching the `join` handler? If so, where should the guest path bypass that cleanly? Is there an existing pattern for unauthenticated WS connections we should mirror?

2. **B1 room open/close model** — `og-requirements.md` D3 says "open/close controls who can enter the lobby/waiting room". What is the CURRENT mechanism in `rooms/store.ts` and `signaling/index.ts`? Is `room.isOpen` already a thing? What does it currently affect — guest queue, or admit gate? Is there a `room-opened` / `room-closed` WS message type already? Confirm before we add or rename.

3. **B2 guest `/join` route** — `app.routes.ts` currently has `/room/:slug` and `/join/:slug` both rendering `room.page.ts` with NO auth guard. Confirm. For the `/join` (no slug) standalone page: should it be a new lazy-loaded component (cleanest), or a mode of the existing room/join page (smaller diff)? Recommend.

4. **B2 unauthenticated user detection in room.page** — How does the page currently detect auth state? Is there an `auth.service.ts` or similar? When the page sees no auth, what does it do today (redirect to /login, or render lobby)?

5. **B3 host leave modal** — There's already a leave button. Is there an existing modal/dialog component pattern (look at `app-leave-dialog` — it appeared in the fix-loop diff). Should we extend it, or add a new modal? Recommend.

6. **B4 host rooms list** — Read `frontend/src/app/pages/rooms/rooms.page.ts/html/scss`. Is the current design close to Google Meet or far from it? Big-rewrite or surgical-redesign?

7. **Scope creep guard** — Anything in the 8-batch plan that you think is overscoped, or anything obviously missing that you'd add? In particular, the plan says "in-call UI explicitly OUT" — confirm nothing in B1–B8 sneaks an in-call UI change in.

8. **Branch / commit hygiene** — We're on branch `fix/sfu-audio-publish-guard` with the fix-loop + features stacking on top. One commit per batch is the rule. Confirm.

Report STATUS: AGREE or STATUS: PROPOSE-CHANGES with concrete items. Once I get your reply I'll greenlight B1.
