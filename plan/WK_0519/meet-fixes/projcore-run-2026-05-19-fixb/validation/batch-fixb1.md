# Validation — FIX-B1 (Signaling race + bg-tab UA-gate + controls contrast)

**Verdict:** **PASS** (iter 1, clean — commit-before-DONE held; I initially read git state mid-commit and misjudged, then re-checked and confirmed 4 atomic commits had already landed).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present:
- `batch-fixb1/changes.md` (User Report verbatim + root causes for all 3 fixes + code-change inventory)
- `batch-fixb1/scenarios-implemented.md`
- `batch-fixb1/test-report.md` (codex's own — 4/4 FIX-B1 spec, 47/47 backend, 40/40 R8.1, live URL refreshed)
- `batch-fixb1/review.md`
- `batch-fixb1/independent-validation.md` (codex's self-check)
- `batch-fixb1/screenshots/controls-light.png` (visual evidence — in-call controls visibly distinct)
- 1 decision: `2026-05-19-fixb1-signaling-buffer.md`

## Gate 2 — Diff review

4 atomic commits:
```
306f371 docs: add FIX-B1 evidence artifacts
278c15f test: add FIX-B1 race and controls specs
1fd0b07 fix: improve light-theme call controls contrast
d22889a fix: buffer early signaling and tighten bg pause gate
```

Spot-checked `d22889a`:
- `private readonly pendingSignals = new Map<string, BufferedSignal[]>()` — buffer added at RoomPage class scope ✓
- `await this.drainPendingSignals(peer.id)` — drain trigger on peer creation ✓
- `this.pendingSignals.delete(msg.clientId)` — cleanup on peer leave ✓
- `this.pendingSignals.clear()` — full cleanup on call end ✓
- `shouldEnableBgPause()` returns `viewport.isMobile() && platform.isMobileUA()` — UA-gate per codex's triage ✓
- Buffer cap (20) and structured `[signaling]` logs both present per the brief

`1fd0b07` controls contrast:
- `.control-btn` background: `var(--panel-soft)` ✓
- border: `1px solid rgba(26, 31, 43, 0.18)` ✓
- subtle box-shadow ✓
- Hover keeps blue accent + lift ✓
- `.is-off`, `.recording`, `.leave-btn` semantic reds unchanged ✓

`278c15f` new spec `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts` — 4 tests covering the 4 contract requirements.

## Gate 3 — Build

PASS — implied by codex's `npm run build -w frontend` + my own independent test runs against the built bundle.

## Gate 4 — Targeted + regression (independent rerun)

- **My independent FIX-B1 spec rerun:** `npm test -w e2e -- tests/v3-fixb1-race --config=playwright.live.config.ts --workers=1` → **4/4 PASS in 14.0s**:
  - FIX-B1.1 buffers offer-before-peer-joined and connects remote audio/video (2.2s) ← **THE root-cause fix**
  - FIX-B1.2 recording after peer connection includes remote audio signal (7.3s) ← closes the recording concern
  - FIX-B1.3 controls are visibly distinct on the light controls bar (1.3s) ← the theme fix
  - FIX-B1.4 background video pause requires mobile viewport AND mobile UA (2.6s) ← the UA-gate
- **My independent Run 1 desktop regression:** `npm test -w e2e -- tests/v2-b3-shell …` → **40/40 PASS in 1.1m** — **R8.1 gate held for the 7th consecutive batch** (M-B1→M-B6 → FIX-B1)
- **My independent backend regression:** `npm test -w backend` → **47/47 PASS in 10.8s**

The two-context race regression (FIX-B1.1) is the strongest evidence the buffer-and-drain approach works: a deterministic scenario forces offer-before-peer-joined ordering and asserts both PCs reach connected + remote audio/video tracks attach.

## Gate 5 — Evidence quality (5Q)

- **Q1 real DOM or fake?** ✓ Two real Playwright BrowserContexts against live `voice.silverjrom.app` with fake-device-for-media-stream injected; PC state observed via real `__meetDebug.peerConnectionStates()`. Recording bytes uploaded through real BE endpoint.
- **Q2 debug-hook abuse?** ✓ `__meetDebug.peerConnectionStates()` and `__meetDebug.recorderSourceCount` are observability hooks for state that isn't DOM-visible (PC connectionState is a JS property, recorder source count is a graph property). Justified additions.
- **Q3 screenshot evidences the right thing?** ✓ `controls-light.png` shows the in-call view with 6 distinct control buttons visible at top-right of topbar — subtle but discriminable against the light bar. Confirms theme fix lands.
- **Q4 scenarios=tests?** ✓ 4 issues raised → 4 dedicated tests; mapping in `scenarios-implemented.md`.
- **Q5 live URL serves it?** ✓ `curl https://voice.silverjrom.app/` returned the refreshed `main-BTE6YXWW.js` bundle (codex confirmed in test-report.md); my own FIX-B1 spec ran against the live URL and PASSED.

### Hygiene

- My Run 1 regression rerun churned v2 screenshot files (same pattern as M-B5/M-B6) — restored via `git checkout`. 
- Codex left a stray `tmp/call.png` from its screenshot capture — removed.
- Working tree clean post-cleanup.

## Gate 6 — Matrix

N/A — fix run (no req-matrix). Run 3 req-matrix is unchanged at 33/37 VERIFIED + 4 operator-pending; the 4 operator gates remain JROM's hands-on smoke.

## Gate 7 — Decisions

1 decision file (`2026-05-19-fixb1-signaling-buffer.md`) — covers buffer-size choice, drain-trigger location, UA-gate change. Appropriately scoped.

## Verdict

**PASS** — all 3 fix issues resolved with verifiable regression coverage. The signaling race fix is the most consequential change; it closes JROM's video, voice, AND recording-completeness concerns in one go (per codex's triage, all three stemmed from this race).

**Next:** dispatch FIX-B2 (transcript speaker-tagging) per JROM's approved plan. JROM can re-test the live call NOW (FIX-B1 is deployed) while FIX-B2 lands in parallel.
