# Codex consult — meet-poc reconstruction (initial intake)

**From:** Claude `/projcore` (session controlling /projcore run)
**To:** Codex in tmux `lkvcdx-39`, cwd `~/websites/meet-poc`
**Purpose:** validate my reading of the current app + weigh in on architectural direction. **No implementation yet.** I'm coming back to JROM first; you and I align before that.

---

## 1. JROM's verbatim ask

> "ok on this app i get this [screenshot showing stitched login+dashboard at voice.silverjrom.app] it seems like a weird stiched up app, when i login, i change my mind please review this and reconstruct it using the stack we used on the other apps in this machine, on websites/lokalcamp. and discuss with codex inside session lkvcdx on how to approach this plan, implement, test using scenarios. please get back to me first on your understanding of this and a high level plan before moving on"

JROM screenshot evidence: login card visible at top of viewport, scroll down → dashboard topbar ("meet-poc" + Logout) + "Create a room" card also visible. Both panels rendered simultaneously after login. That is the "weird stitched" symptom.

## 2. Current state (what's running today)

- **Stack:** Express + `ws` single-file Node server (`server.js`, 371 LOC) + vanilla HTML/CSS/JS in `public/` (3 files, ~770 LOC). JSON file (`data.json`) for users, rooms, sessions. PM2 process `meet-poc` on port 4700. Served via CF Tunnel at `voice.silverjrom.app`.
- **Behavior:** email/password login → dashboard (create room) → shareable `/room/:id` link → WebRTC P2P (full-mesh) signaling via WS → knock/admit by owner → MediaRecorder client-side → upload .webm to `recordings/`.
- **README scope statement:** *"prototype only. Designed to be thrown away or rewritten when porting into lokalcamp."* (Author intended exactly the reconstruction JROM is now asking for.)

## 3. Mechanism of the "stitched" symptom (my diagnosis — please double-check)

`public/style.css:9`:
```css
.panel.auth { display: flex; align-items: center; justify-content: center; height: 100vh; padding: 16px; }
```

`public/index.html`: `login-panel` and `lobby-panel` carry class `panel auth`; `dashboard-panel` and `call-panel` carry only `panel`.

`public/client.js:25-29` toggles visibility via `el.hidden = true/false`. The browser default `[hidden] { display: none }` has specificity (0,1,0); the author's `.panel.auth { display: flex }` has specificity (0,2,0) and **wins**.

**Result:** when `showOnly('dashboard-panel')` sets `login-panel.hidden = true`, the login panel keeps rendering because `display: flex` overrides the user-agent `[hidden]` rule. Same for `lobby-panel`. Both `.auth` panels are effectively non-hideable via the `hidden` attribute.

A 1-line CSS fix (`.panel[hidden] { display: none !important; }`) would suppress the symptom. But JROM is asking for the full reconstruction onto the lokalcamp stack — symptom-fix is not the brief. I want to confirm the mechanism with you so we don't carry it into the rewrite.

**Codex Q1:** does this match what you'd diagnose from the same files? Anything else weird you'd flag?

## 4. Lokalcamp stack summary (the reconstruction target)

Per `~/websites/lokalcamp/project_specs.md`:
- **Backend:** Cloudflare Workers (`wrangler dev`) + D1 (SQLite) + R2 (object storage) + KV. Hono router + GraphQL Yoga + Pothos schema. JWT via `jose`, bcrypt for passwords, zod for validation. Per-module structure under `worker/src/modules/<name>/{mutations,queries,types,schema,subscribers}.ts`.
- **Frontend:** Angular 20+ (standalone components, signals) + Apollo Client + Ionic + Ionicons + RxJS.
- **Process:** PM2 (`lokalcamp-be` wrangler dev on :4610; `lokalcamp-fe` proxy on :4600 via `scripts/serve.js`).
- **Deploy "DEV":** CF Tunnel → localhost:4600 → lokalcamp.silverjrom.app. No real wrangler-deploy yet.
- **Multi-tenant pattern:** orgs → projects → project_members (admin/member/client). NOT relevant for meet-poc unless we put rooms under a project.

## 5. The architectural choice I need your read on

**Option A — Port meet-poc INTO lokalcamp** as a new module:
- `worker/src/modules/meet/{schema,mutations,queries,types,subscribers}.ts` for room CRUD
- New Durable Object class `MeetSignalingRoom` for stateful WebSocket signaling (one DO instance per room)
- `frontend/src/app/pages/meet/` for lobby + call UI
- Recordings → R2 via signed upload URLs
- Rooms scoped under a project (or org), inherit lokalcamp's auth/RBAC
- Pros: reuse auth, multi-tenant, billing path, no second app to maintain
- Cons: meet is a very different beast from PM-style features (low-latency real-time vs CRUD); pollutes lokalcamp surface; couples WebRTC concerns into the wider app

**Option B — Standalone "voice" app on the SAME stack** (keep voice.silverjrom.app identity):
- Repo: either `~/websites/meet-poc` (rewrite in place) or `~/websites/voice` (new dir, then retire meet-poc)
- Same primitives: Workers + DO for signaling + D1 for users/rooms/sessions + R2 for recordings + Angular FE
- Pros: clean separation; meet's tight real-time loop doesn't drag on lokalcamp; keeps current URL; easier to evolve independently
- Cons: parallel auth surface (although users can be a tiny subset — just JROM for now); two Angular front-ends to keep visually consistent

**My read:** JROM said *"reconstruct it using the stack we used on the other apps … on lokalcamp"* — phrasing suggests Option B (use the stack, separate app). The current app already lives at its own URL. The README explicitly framed it as a future port. But I want to surface both to JROM rather than decide alone.

**Codex Q2:** A or B? Any third option I'm missing? Important: which serves JROM's *"stitched up app"* irritation better — both fix the symptom; B keeps things smaller; A consolidates but adds surface to a project mid-build (lokalcamp is in active WK_0518 build).

## 6. WebRTC signaling on Workers — the technical wrinkle to verify

Standard pattern for stateful WebSocket apps on CF Workers = **Durable Objects**. Each room → one DO instance → persistent WS server with hibernation API. D1 is for room metadata, DO is for live signaling state (admitted/pending sets, peer broadcast). R2 for recording uploads via signed PUT.

**Codex Q3:** does this match your understanding? Any gotchas you'd raise (DO websocket hibernation quirks, signaling latency on Workers vs node `ws`, recording upload size limits, TURN/STUN — current app uses google STUN only and notes pure STUN fails on symmetric NAT)? Should we provision a coturn or use a managed TURN as part of the rebuild?

## 7. Proposed batches (rough — your edits welcome)

If Option B + Durable Objects path:
- **B1 — Worker + D1 foundation:** wrangler config, D1 migration (users, rooms, sessions), auth (JWT, login, /me, logout), bootstrap test
- **B2 — Signaling Durable Object:** `MeetRoom` DO class, WS endpoint, knock/admit protocol, peer-joined/peer-left/signal relay (ported from current `server.js` WS handlers)
- **B3 — Angular shell + auth:** Angular skeleton, login page, dashboard page, room CRUD via GraphQL or REST (decide), shared layout matching lokalcamp visual conventions
- **B4 — Call UI + WebRTC client:** lobby, knock state, call view (tiles, mic/cam/screen toggles, waiting-room admit panel for owner), port the WebRTC client logic from `public/client.js`
- **B5 — Recording (R2):** MediaRecorder mix logic (kept client-side from current app), signed-URL upload to R2, recordings listing in dashboard
- **B6 — Cutover + retirement:** deploy under voice.silverjrom.app via CF Tunnel (or wrangler deploy if we go full remote), retire old Express server, archive `meet-poc` repo or rewrite-in-place

**Codex Q4:** do these batch boundaries hold? Anything you'd merge/split? Should B1+B2 be one batch since DO + worker bootstrap are tightly coupled? Should we add an explicit **B0 — scenarios/og-requirements lock** before B1 (mandatory per /projcore — `og-requirements.md` is the contract)?

## 8. Scenarios / test strategy

Lokalcamp uses Playwright e2e under `e2e/`. For meet-poc rebuild we need:
- Auth scenarios (login, bad-password, /me, logout, cookie/JWT round-trip)
- Room CRUD scenarios
- **Two-peer signaling scenarios** (the hard part — needs two browser contexts in Playwright connecting via WS to a Worker, exchanging signaling, verifying admit/reject)
- Recording upload scenario (mock MediaRecorder, verify R2 PUT)

**Codex Q5:** Playwright multi-context for WebRTC is doable but flaky. Recommendation: targeted-per-module first (per JROM's targeted-first e2e rule §2.10a), full e2e only as sanity check. Do you have a cleaner pattern for testing P2P signaling in CI?

---

## What I need from you

A reply ending with:

```
STATUS: APPROVE — agree on diagnosis + Option B + DO path + batch plan
```

OR

```
STATUS: REVISE — <which questions you'd change my answer on, your alternative>
```

OR

```
STATUS: NEEDS-INFO — <what you'd want JROM to clarify before we propose>
```

Keep it tight. I'm coming back to JROM with our joint understanding + high-level plan. **No code changes** — this is reconstruction-plan alignment only.

— Claude /projcore
