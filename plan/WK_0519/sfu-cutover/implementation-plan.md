# Implementation plan — mesh → Cloudflare Realtime SFU cutover

**Branch:** `feat/sfu-cutover` (cut from `fix/meet-conn-diag` after F1/F2/F3 land; those mesh fixes ship to the live mesh as the fallback baseline until cutover completes).

**Roles (JROM-set, 2026-05-21):**
- **Implementer:** `claude --model sonnet --dangerously-skip-permissions` in tmux session B. Per-task Opus escalation only if a task fails validation ≥2× (the hard negotiation tasks B2/B4 are escalation candidates).
- **Validator:** codex in tmux session A — reviews this plan first, then validates each task independently (diff + tests).
- **Overseer/gate:** projcore (this Opus session) — dispatches atomic briefs, runs the 7-gate + 5Q on top of codex's validation, owns req-matrix + context hygiene. One task at a time.

**Strategy:** build the SFU path alongside the mesh on a feature branch; the mesh stays the live default until SR-10 passes, then SR-8 retires it. Never break the live mesh app mid-cutover.

---

## Batches (atomic vertical slices, dependency-ordered — REVISED per codex plan review)

**Order:** B0 → B1 → B2 → B3 → B4a → B4b → B5a → B5b → B6a → B6b → B7 → **B9 → B8** → B10. (Diagnostics land BEFORE mesh teardown so validators keep evidence while old recovery code is removed.)

**B0 — Raise participant cap (SR-0).** Behind the feature branch, raise/remove `MAX_ADMITTED`/mobile cap with an explicit product cap + billing guard so >5 is provable later. Test: signaling admits >5. *Escalation: no.*

**B1 — Backend CF Realtime proxy (SR-1).** New `backend/src/modules/realtime-sfu/`: server-side client for `sessions/new`, `tracks/new`, **`tracks/update`**, `renegotiate`, `tracks/close` (mid-based), `get session`, Bearer App Secret from env. `/api/sfu/*` gated by admitted-membership AND resource-ownership authz. Tests: real-session smoke (creds valid, no token leak) + mocked CF 4xx/5xx error-contract test + unauth/foreign-resource → 403. *Escalation: no.*

**B2 — Publish local media + the operation queue (SR-2).** Frontend SFU client service: one RTCPeerConnection, add local audio + pre-negotiated video transceiver (camera-off-safe), publish via B1. **Establish the single serialized negotiation/operation queue here** (all later PC mutations go through it). Persist the track/mid model. Test (e2e): one client joins, session active, local tracks published (outbound stats). *Escalation: YES (SDP/publish + queue core).*

**B3 — Signaling presence (SR-3).** Extend ws: broadcast per-participant CF sessionId + trackNames (+ roster revision number) + add/remove updates; client roster of remote publishers with stale-rejection. Test: two clients → each sees the other's publisher entry; a withdrawn track is rejected by revision. *Escalation: no.*

**B4a — Single remote subscribe + render (SR-4).** Subscribe to ONE remote publisher's tracks (location:remote), handle CF renegotiation via the B2 queue (CF offer→answer→/renegotiate), render the tile via ontrack. Test (core proof): two clients → each sees+hears the other through CF (framesDecoded>0, audio packets). *Escalation: YES (subscribe/renegotiation core).*

**B4b — Late join + live publisher updates + unsubscribe (SR-4).** Late joiner subscribes to everyone present; new publishers picked up live; remote leave → unsubscribe + tile removed (roster-revision-driven). Test: 3rd client joins late and sees the first two; one leaves and its tile clears. *Escalation: maybe.*

**B5a — Mic/cam toggles (SR-5).** Mute/unmute, camera on/off over SFU (replaceTrack / track enabled + announce); host mute/remove/end trigger SFU close + roster withdrawal. Test: cam off/on + mute reflected on remote. *Escalation: no.*

**B5b — Screenshare as a separate track (SR-5).** Screenshare publishes a SEPARATE video track (not a camera replacement — different lifecycle/priority/tile), announced via SR-3, closed on stop. Test: screenshare visible to remote alongside camera; stop withdraws it. *Escalation: no.*

**B6a — Publisher simulcast (SR-6).** Publish video with RID simulcast encodings (high/med/low). Test: published video SDP has multiple RIDs; outbound stats show layers. *Escalation: maybe (encoding config).*

**B6b — Subscriber layer preference (SR-6).** Per-receiver layer selection via `/tracks/update` (`preferredRid`/`priorityOrdering`/`ridNotAvailable`); phones request low, screenshare prioritized. Test: a constrained receiver gets a lower layer (verify via stats/API). *Escalation: maybe (depends on B1 tracks/update + B2 queue).*

**B7 — Reconnect/leave/teardown (SR-7).** Drop → reattach (new CF session announced, old invalidated, retain DR-37/38/39 identity/token, re-publish/subscribe, no ghost tiles, respect CF 30s GC); deliberate exit closes tracks-by-mid + PC + removes card. Test: drop+resume restores media; exit removes card; no ghosts. *Escalation: no.*

**B9 — SFU diagnostics (SR-9) — BEFORE teardown.** Adapt DR-54 instrumentation to SFU (one PC; publish/subscribe per-track stats; CF edge/candidate; audio jitter-buffer; simulcast layer in use); retain two-sided server-side logging (DR-41). Test: a call's diagnostics rows show SFU session + per-track stats. *Escalation: no.*

**B8 — Retire mesh + mesh-only hardening (SR-8).** Remove mesh PC fan-out, per-peer glare, per-peer PC-recreate, mesh degrade (DR-42/F3), DR-31 mesh dedup, mesh `signal` relay. **KEEP/ADAPT:** operation serialization, DR-40 single-PC recovery (ICE-restart/media-dead/fresh-ICE for client↔CF), identity dedup/no-ghost, admit/identity/reconnect, chat(ws), host, diagnostics, DR-46, DR-45(bind to SFU ontrack). ICE = CF STUN + TURN fallback. Test: full suite green; no dead mesh code; SFU-only app works. *Escalation: no, but careful diff review.*

**B10 — Full cutover validation (SR-10).** E2E: 2-party (camera-off join→camera-on→screenshare), 3+/>5 party, phone low-layer, reconnect, deliberate exit. Record expected CF-to-client egress exposure (cost note). Then JROM field-test on a real PH↔US call. *Capstone (95/5 rule).*

---

## Per-task loop (projcore-driven)
1. projcore writes `prompts/B<n>.md` (atomic brief, acceptance criteria, scope guards, callback-first).
2. Dispatch to **implementer (tmux B, Sonnet)** via 3-call protocol → plan handshake (STATUS: PROPOSED) → projcore APPROVED-PLAN → implement → commit → STATUS: DONE + callback.
3. Dispatch the commit to **validator (tmux A, codex)**: "validate B<n> against og-requirements SR-x: read diff, run tests, report PASS/FAIL with evidence." 
4. projcore runs its own 7-gate + 5Q on top. PASS → context-handoff + advance. FAIL → correction brief to implementer (max 3 iter; escalate task to Opus on 2× fail for B2/B4).
5. Update req-matrix + Overmind tasks at each boundary.

## Out of scope / deferred
- AGJAssist Voice SDK (separate, deferred).
- Recording over SFU (revisit after cutover if needed).
- Cost monitoring/alerting on CF egress (note for JROM; not a build task).
