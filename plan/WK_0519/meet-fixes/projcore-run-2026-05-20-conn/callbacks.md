# Codex -> Projcore Callback Channel (v2.0)

Codex appends one line per STATUS change as the final action of each reply:
`[projcore callback] <batch-id> <STATE> <note>`

---
[projcore callback] diag1 PROPOSED mechanism-level plan ready; recommend 2-batch split with reliability core first
[projcore callback] diag1 DONE Batch A DR-5/DR-4 committed at 5a41110; targeted tests pass, full e2e has pre-existing/out-of-scope failures
[projcore callback] diag1cf DONE Cloudflare TURN mint completed at 7a03c9d; backend/build/Run-1 69-spec regression pass and live curl returned turn URLs
[projcore callback] diagb1 PROPOSED plan ready; DR-9 needs small backend pending-list resync plus frontend quick-join/validation/doorbell work
[projcore callback] diagb1 DONE committed e92e514; DR-6/7/9/10 implemented with build/backend/e2e verification and pm2 restart complete
[projcore callback] diagb1 DONE iter1 committed f53da9a; Run-1 plus DIAGB1 gate passed 74/74 after mic-meter expander fix
[projcore callback] diagb2 PROPOSED plan ready; DR-1 helper plus DR-2 diagnostics/force-relay and DR-3 reconnect/resync scoped
[projcore callback] diagb2 DONE committed 4567de7; DR-1/2/3 implemented, backend 103/1-skip, full Run-1+diag1+diagb1+diagb2 77/77, live diagb2 smoke 3/3, pm2 restarted
[projcore callback] diagc PROPOSED plan ready; DR-11 quality polling, receiver-video-control pause/resume signaling, hysteresis, and manual audio-only scoped
[projcore callback] diagc DONE committed cbaa018; DR-11 voice-first resilience implemented, backend 103/1-skip, DIAGC 1/1, full Run-1+diag1+diagb1+diagb2+diagc 78/78 on isolated DB, pm2 restarted
[projcore callback] diagd PROPOSED plan ready; DR-12 join-prereq popout plus DR-13 audio-priority invariant hardening scoped
[projcore callback] diagd DONE committed 59be4c0; DR-12/13 implemented, backend 103/1-skip, DIAGD 5/5, clean Run-1+diag1+diagb1+diagb2+diagc+diagd 83/83, pm2 restarted
[projcore callback] diage1 PROPOSED plan ready; DR-14 clickable room rows plus DR-15 slug migration/backfill, resolve-by-slug-or-id, and WS slug-to-id mapping scoped
[projcore callback] diage1 DONE committed f63b158; DR-14/15 implemented, backend 106/1-skip, DIAGE1 4/4, clean Run-1+diag1+diagb1+diagb2+diagc+diagd+diage1 87/87, live DB migration ok TEST_ROOM01 slugged, pm2 restarted
[projcore callback] diagf PROPOSED plan ready; root cause identified as server peer-left/delete on transient WS close plus resume-by-new-clientId causing duplicate identity/tiles, with sticky canonical identity and disconnect grace scoped
[projcore callback] diagf DONE committed 973dbce; DR-18/19/21/22 implemented, backend 108/1-skip, DIAGF 2/2, clean Run-1+diag gate 89/89
[projcore callback] diage2 PROPOSED plan ready; DR-16 room open-state schema, owner-gated controls, closed-room timed wait, open-room admit flow, and clean-env validation scoped
[projcore callback] diage2 DONE committed f0f7416; DR-16 implemented, backend 113/1-skip, DIAGE2 2/2, clean Run-1+diag gate 91/91, pm2 clean env verified
[projcore callback] diagg PROPOSED plan ready; DR-17 true-orientation video surfaces plus DR-20 five-second active-speaker order settle scoped
[projcore callback] diagg DONE committed 24162c4; DR-17/20 implemented, backend 113/1-skip, DIAGG+FIXC3 4/4, clean Run-1+diag gate 93/93, pm2 clean env verified
[projcore callback] diagh PROPOSED plan ready; server-side room-name search via GET /api/rooms?q= scoped with pagination, slugs, row-click, and access controls preserved
[projcore callback] diagh DONE committed 50ce481; DR-23 implemented, backend 114/1-skip, DIAGH 1/1, clean Run-1+diag gate 94/94, pm2 clean env verified
[projcore callback] diagi PROPOSED plan ready; root cause identified as first lobby preflight ignoring selected device IDs plus mobile facingMode overriding explicit camera picker deviceId, with lobby/in-call swap tests scoped
[projcore callback] diagi DONE committed 23135a9; DR-25 implemented, backend 114/1-skip and npm run build pass; Playwright/e2e + live-deploy DEFERRED (freeze)
[projcore callback] diagz PROPOSED audit approach ready; DR-24 report-only module map, coupling risk ranking, god-object analysis, and refactor recommendations scoped
[projcore callback] diagz DONE committed 933b3e7; DR-24 modularization audit delivered, report-only with no production refactor or deploy
