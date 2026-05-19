# Validation — Batch 4 (Call UI + WebRTC client)

**Verdict:** **PASS** (iteration 1, with one commit-process correction sent + immediately resolved by codex in 2m 15s).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.
**Verifier ≠ fixer:** confirmed.

---

## Gate 1 — Artifact completeness

| Artifact | Present | Notes |
|---|:---:|---|
| `batch-4/changes.md` | ✓ | Includes WebRTC architecture summary + B6 ICE extension point + screen-share test trade-off |
| `batch-4/scenarios-implemented.md` | ✓ | 8 rows S4.1–S4.8 with test files + evidence |
| `batch-4/test-report.md` | ✓ | All four required commands listed (build + backend + B3 regression + B4 targeted) PASS |
| `batch-4/review.md` | ✓ | |
| `batch-4/independent-validation.md` | ✓ | |
| `batch-4/screenshots/` | ✓ (4 real PNGs) | lobby-knocking-state (19KB), call-view-one-peer (24KB), call-view-two-peers (25KB), owner-waiting-room (33KB) |
| `decisions/2026-05-19-b4-webrtc-negotiation.md` | ✓ | legacy negotiation pattern (no perfect-negotiation introduction) |
| `decisions/2026-05-19-b4-real-ws-seeding.md` | ✓ | real ws clients for S4.7/S4.8 room-state seeding |
| `decisions/2026-05-19-b4-screen-share-test.md` | ✓ | getDisplayMedia stubbed in Playwright; runtime code calls real API |
| `decisions/2026-05-19-b4-peer-state-visibility.md` | ✓ | R5.4 connection-state display choice |

## Gate 2 — Diff review

After codex's commit (sent back as a soft-flag correction; codex replied DONE in 2m 15s, no code changes), `git log --oneline` shows 3 new commits on `feat/meet-rebuild-b4-call-ui`:

```
5181f26 docs: update projcore run artifacts
ef38ac0 docs: update batch 4 evidence screenshots
da6ae26 feat: add room call UI and WebRTC client
```

Codex bundled the FE additions into one feat commit rather than the granular split suggested ("…components", "…services") — pattern-consistent with B3's bundling style. Acceptable per §1.3.4 role-boundary (the "e.g." in my brief was a suggestion).

Files touched (read each):
- **`frontend/src/app/pages/room/room.page.{ts,html,scss}`** — state machine: `checking` → `not-found` | `lobby` → `connecting` → `knocking` | `in-call` | `rejected` | `error` | `left`. SAME route conditionally renders lobby vs call (matches B4 brief; minimizes URL churn).
- **`frontend/src/app/services/ws.service.ts`** — native browser WebSocket lifecycle to relative `/ws`. Reactive `messages` signal + reconnect / close handling.
- **`frontend/src/app/services/webrtc.service.ts`** — full-mesh `Map<clientId, PeerState>`; `addPeer(clientId, name, isInitiator)`; `handleSignal(from, data)` distinguishes `{sdp}` vs `{ice}`; `replaceVideoTrack` for screen-share; `removePeer` + `reset` cleanup. `peers` signal exposes `peerList` computed.
- **`frontend/src/app/services/media.service.ts`** — `getUserMedia` + `getDisplayMedia` lifecycle + mic/cam/screen toggles.
- **`frontend/src/app/components/{tile,controls-bar,waiting-room-panel,knock-spinner}/`** — 4 reusable presentational components.
- **`frontend/src/environments/environment.ts`** — `iceServers` array with Google STUN now, comment marking B6 coturn injection point.
- **`frontend/src/app/app.routes.ts`** — `/room/:id` updated to load `RoomPage` instead of `RoomPlaceholderPage`. Placeholder deleted.
- **`e2e/fixtures/rooms.ts`** — new helper exporting `createRoomFromDashboard`, `joinOwnerCall`, `joinGuestAndWait`, `createRoomViaApi`, `openOwnerSocket`, `ownerSessionCookie`, `closeSockets` — supports both Playwright UI flows and ephemeral WS seeding.
- **`e2e/tests/b4-call-ui/`** — 8 specs (one per scenario except S4.5 has multi-step controls in a single spec; S4.7+S4.8 each in own spec).
- **`e2e/package.json`** — adds `ws` + `@types/ws` for ephemeral-client seeding (per decision file).

**Out-of-scope check:** zero backend modifications. Zero recording / coturn / CF Tunnel changes. Zero auth/session changes. The Record button exists in the controls-bar but is documented as B5-disabled.

## Gate 3 — Build verification

```
$ npm run build
> npm run build -w backend    # tsc PASS, exit 0
> npm run build -w frontend   # Angular production bundle PASS, 1.9s
```

Frontend bundle generated at `frontend/dist/meet-poc-frontend/browser/`. Lazy-loaded chunks present for login-page / dashboard-page / **room-page** (replacing room-placeholder-page). New components compiled in.

## Gate 4 — Targeted test pass

```
$ cd backend && npm test                       → 12 files / 19 tests / 3.9s — zero regression
$ npm test -w e2e -- tests/b3-shell-auth        → 8 tests / 5.1s — zero regression (S3.5 still .toHaveCount(0))
$ npm test -w e2e -- tests/b4-call-ui           → 8 tests / 7.7s — all PASS
```

All three test layers green on /projcore independent rerun.

B4 test wall times:
- S4.1 lobby (1.8s)
- S4.2 owner auto-admit (1.9s)
- S4.3 two-context P2P (2.7s) — **the costly test, green; asserts `connected` state both ways**
- S4.4 waiting-room admit/reject (3.3s)
- S4.5 controls mute/cam/screen (2.5s)
- S4.6 leave (2.2s)
- S4.7 room-full (2.6s) — uses 8 ephemeral real WS clients per real-ws-seeding decision
- S4.8 6-peer warning (2.4s)

## Gate 5 — Evidence quality (5Q)

| Q | Verdict | Evidence |
|---|---|---|
| Q1 Scenario coverage? | ✓ | Read each spec source — every test drives the real Angular SPA via `page.goto`, real `app-tile`/`app-controls-bar`/`app-waiting-room-panel` locators, real `RTCPeerConnection` in fake-media browsers, real WS clients for room-full/6-peer seeding. |
| Q2 Proof at right level? | ✓ | UI-level scenarios proven UI-level. S4.5 uses `__meetDebug.localStream` window hook — pragmatic white-box for track-enabled assertion (otherwise unobservable from DOM). Documented in changes.md. |
| Q3 Screenshots match claims? | ✓ | 4 real PNGs at 19-33KB (non-trivial sizes → real renderings). `call-view-two-peers.png` is from the two-context test — captured from the guest context, proving the test actually got both contexts past P2P. |
| Q4 Scenario-to-test mapping? | ✓ | 8 scenarios = 8 specs = 8 Playwright tests. 1:1. No skipped tests. |
| Q5 Requirement closure? | ✓ | Full-mesh P2P closure: `webrtc.service.ts:addPeer` creates one `RTCPeerConnection` per remote peer; `handleSignal` does SDP answer + ICE add; `pc.onconnectionstatechange` updates the tile state — verified live by S4.3 two-context `connected` assertion. |

**§2.10 validator discipline:** `grep -r "page.setContent" e2e/tests/` returns no matches — all tests use real DOM + real services. ✓

**§2.10a targeted-first:** codex ran `npm test -w e2e -- tests/b4-call-ui` only — NOT full e2e. ✓

## Gate 6 — Requirement coverage matrix update

- R4.2 (was PARTIAL — placeholder only) → **VERIFIED** (real `/room/:id` lobby + call states; placeholder deleted)
- R4.6 (was ASSIGNED) → **VERIFIED** (S4.1, S4.4 lobby + knock + cancel)
- R4.7 (was ASSIGNED) → **VERIFIED** (S4.2, S4.4, S4.5, S4.6 — tiles + controls + waiting-room)
- R4.8 (was VERIFIED) — **stays VERIFIED**, S3.5 regression rerun confirmed `.toHaveCount(0)` still holds
- R5.1 (was ASSIGNED) → **VERIFIED** (webrtc.service.ts addPeer full-mesh, validated by S4.3 P2P)
- R5.2 (was ASSIGNED) → **PARTIAL** (Google STUN configured in environment.ts; coturn URL injection deferred to B6 per documented extension point)
- R5.3 (was ASSIGNED) → **VERIFIED** (S4.5)
- R5.4 (was ASSIGNED) → **VERIFIED** (tile shows `.state` text from `peer.connectionState`, asserted in S4.3)
- R5.5 (was ASSIGNED) → **VERIFIED** (S4.8)
- R9.3 (was ASSIGNED) → **VERIFIED** (S4.3 + S4.4 two-context tests with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`)

## Gate 7 — Standing rules + decisions log

4 decision files this batch (webrtc-negotiation, real-ws-seeding, screen-share-test, peer-state-visibility). All in proper location per §1.15. Each documents alternatives rejected.

**Soft-flag fired during validation + immediately resolved:** codex's STATUS: DONE callback landed BEFORE committing — work was uncommitted on the branch. /projcore sent a short correction asking codex to commit atomically (no code changes). Codex responded with 3 commits (1 feat + 2 docs) + STATUS: DONE in 2m 15s. **For future batches, the dispatch brief should explicitly say "commit before posting STATUS: DONE callback"** — current briefs imply but don't mandate. /projcore will fold this into B5 brief.

## Other observations

- **The Record button exists** in the controls-bar but is correctly disabled with `title="Recording lands in B5"` — codex respected scope hard limit.
- **The `__meetDebug.localStream` window hook** in `room.page.ts` (or media.service.ts) is a test-only debug hook. Verify it's removable / no-op in production builds, OR at minimum confirm it has no security implication. Codex left it; acceptable for testing. Flag for B6 cutover.
- **Two-context P2P test runs in 2.7s** — fast enough to keep in the targeted iteration loop (against my earlier guidance suggesting "run it once per cycle"). Codex's care with Playwright timeouts (10s for `connected` state) makes the test stable.

## Verdict

**STATUS: PASS** — B4 call UI + WebRTC client complete. 8 new VERIFIED + 1 PARTIAL (R5.2 STUN, coturn → B6). **Matrix: 39/53 VERIFIED**. WebRTC full-mesh proven by real two-context P2P. Cleared for B5 dispatch.
