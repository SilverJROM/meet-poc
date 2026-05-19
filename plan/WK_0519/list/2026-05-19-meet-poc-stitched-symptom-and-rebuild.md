---
date: 2026-05-19
project: meet-poc
type: feature-request + bug-report
status: in-progress
agent: projcore
qa_verification: closed by S3.5 (stitched-panel absent in DOM after Angular SPA cutover) + final acceptance smoke at voice.silverjrom.app
---

**JROM's verbatim quote:**
> "ok on this app i get this [Image #1] it seems like a weird stiched up app, when i login, i change my mind please review this and reconstruct it using the stack we used on the other apps in this machine, on websites/lokalcamp. and discuss with codex inside session lkvcdx on how to approach this plan, implement, test using scenarios. please get back to me first on your understanding of this and a high level plan before moving on"

**Symptom:** at https://voice.silverjrom.app after login, both the login card AND the dashboard topbar+create-room card render simultaneously in a vertically stacked layout. CSS specificity bug: `.panel.auth { display: flex }` (specificity 0,2,0) overrides browser default `[hidden] { display: none }` (specificity 0,1,0).

**Decision:** full rebuild on Angular FE + TS Node BE + better-sqlite3 + coturn (instead of 1-line CSS hotfix). Reasoning: PoC README always intended a rewrite; current vanilla-JS approach is brittle; JROM wants the lokalcamp FE patterns.

**Plan:** `plan/WK_0519/meet-rebuild/` — 6 batches (B1-B6), codex implements, /projcore validates.

**Closed by:** Phase 2 final acceptance — all 50 og-requirements VERIFIED + JROM smoke-tests voice.silverjrom.app.
