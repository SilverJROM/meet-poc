# Batch M-B6 — Real-device acceptance (operator-assisted final batch)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree.
**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.** But this batch is OPERATOR-ASSISTED by definition — codex can't probe real iOS Safari or real Android Chrome from this machine. The deliverable is the **artifacts JROM needs to do the smoke**, not a hands-on smoke from codex.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B6 (final Run 3 batch — operator-assisted real-device acceptance)
**Branch:** `feat/meet-v3-mb6-acceptance` — off M-B5 HEAD.

**Requirements assigned:**
- **R7.1** — Real iPhone 14+ Safari + Android Chrome SIMULTANEOUS smoke (JROM's responsibility; codex provides the checklist)
- **R7.2** — Lighthouse mobile audit ≥ 85 acc / ≥ 70 perf / ≥ 85 best-practices (codex provides the script; JROM runs it)
- **R7.3** — Real 2-min call between two REAL devices with audio + video (JROM's responsibility)
- **R7.4** — Side-by-side comparison screenshots (codex captures Playwright mobile-emulation as proxy; JROM optionally captures real-device for highest fidelity)
- **R7.5** — Final JROM smoke + sign-off (JROM only)
- **R6.5** — `100dvh` covers iOS Safari address bar (verified ONLY via real-device — codex can't simulate iOS Safari address bar collapse in Playwright)

Read in full:
- `og-requirements.md` (R7)
- `scenarios.md` (S7.1-S7.5)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` — note R7.1 changed from OR-with-desktop to AND-iOS-Android-simultaneous

---

## What codex IS doing this batch (everything mechanical)

### 1. Operator checklist `OPERATOR_SMOKE.md` at repo root

A standalone document JROM (or any future operator) follows on real devices. Format:

```markdown
# meet-poc v3 Mobile Operator Smoke

URL: https://voice.silverjrom.app
Credentials: see INITIAL_PASSWORD.txt (do NOT share)

## Setup
- Device A: iPhone 14+ in Safari
- Device B: Pixel / current-gen Android in Chrome
- Both connected to internet (any network)

## Smoke flow (do simultaneously on both devices unless noted)
1. Open URL → expect login page
2. Sign in → expect /app/rooms with the mobile bottom-sheet shell
3. Tap each of the 6 sidebar tabs → no broken pages
4. Open TEST_ROOM01 → mobile lobby with "Tap to enable mic preview" pill
5. Tap the pill → mic meter activates (bars light up when you speak)
6. Tap "Flip camera" → preview swaps front/rear
7. Tap "Join" → in-call view
8. (On host device only) Tap Record → red "Host is recording" banner appears on BOTH devices
9. (On Device A) Open participant sidebar (bottom-sheet) → see both names
10. (On host device only) Open Leave dialog → see "End for all" / "Just leave" options
11. (Optional) Rotate to landscape → call view should remain usable
12. (Optional) Background the app (home screen) → audio continues; video pauses (peer sees avatar)
13. Foreground the app → video resumes
14. End the call (host: End for all) → both devices land on /app/rooms
15. Verify the new recording appears in /app/recordings (if you recorded)

## Pass criteria
- [ ] All 15 steps work on iPhone Safari
- [ ] All 15 steps work on Android Chrome
- [ ] No layout clipping (esp. iOS Safari address bar)
- [ ] No JS errors in browser console (check via Safari Web Inspector or Chrome remote debug if available)

## Report
Save screenshots to: `plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-6/operator-screenshots/`
```

### 2. Lighthouse mobile audit script `scripts/lighthouse-mobile.sh`

```bash
#!/bin/bash
# Run from any machine with Chrome + Lighthouse installed (npx lighthouse … from desktop is fine)
# Usage: ./scripts/lighthouse-mobile.sh
URL="${1:-https://voice.silverjrom.app/login}"
OUTPUT_DIR="${2:-plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-6/lighthouse}"
mkdir -p "$OUTPUT_DIR"
npx lighthouse "$URL" \
  --preset=desktop \
  --form-factor=mobile \
  --throttling-method=simulate \
  --output=html \
  --output=json \
  --output-path="$OUTPUT_DIR/lighthouse-mobile-$(date +%Y%m%d-%H%M%S)" \
  --chrome-flags="--headless=new"
echo "Lighthouse report: $OUTPUT_DIR/lighthouse-mobile-*.html"
```

Plus a Node-only fallback that uses `lighthouse` npm dep directly if `npx` isn't available.

**Codex executes the script once to capture a baseline run.** If Lighthouse targets aren't met (acc < 85 / perf < 70 / best-practices < 85), document failures in changes.md but DON'T auto-block (per locked Q6 default — below-targets is a flag, not blocker).

### 3. Playwright mobile-emulation proxy screenshots (R7.4)

Capture from Playwright at `https://voice.silverjrom.app` at three viewports:
- iPhone 14 portrait (390×844)
- Pixel 7 portrait (412×915)
- Desktop reference (1920×1080)

Pages captured at each viewport:
- `/login`
- `/app/rooms`
- `/app/ongoing`
- `/app/recordings`
- `/room/<TEST_ROOM01>` lobby
- `/room/<TEST_ROOM01>` lobby with pill tapped (mobile only)
- In-call (single-peer)

Save to `batch-6/screenshots/`. These are PROXIES for real-device — call them out as such in changes.md (real iOS Safari behavior, especially address-bar collapse + safe-area-inset, isn't fully replicable in Playwright Chromium emulation).

### 4. Live curl-based smoke from codex's side (R6.5 partial)

curl `https://voice.silverjrom.app/` from codex's bash and verify Angular `<app-root>` markup. Already proven across Run 1 batches; one more cycle for confidence.

### 5. Final-run aggregate doc `OPERATOR_HANDOFF.md` at repo root

Short doc summarizing for JROM:
- What Run 3 delivered (the 5 implementation batches at a glance)
- What's deferred to v3.5 (the consult-revised defer list)
- Where to find each artifact
- The 15-step operator checklist link
- The Lighthouse report link
- Comparison screenshots link

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-6/`:
1. `changes.md` — full template + each artifact's purpose + Playwright emulation caveats
2. `scenarios-implemented.md` — for each S7.x, note "codex prepared evidence — operator smoke pending"
3. `test-report.md` — Lighthouse baseline + Playwright proxy capture run + Run 1 desktop regression 40/40 (final time at gate)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — Playwright mobile-emulation proxies (iPhone + Pixel + desktop comparison; 7 pages × 3 viewports ~= 21 screenshots)
7. `lighthouse/` — at least one baseline Lighthouse HTML + JSON
8. `operator-screenshots/` — empty folder JROM fills in
9. `OPERATOR_SMOKE.md` (repo root) — 15-step checklist
10. `OPERATOR_HANDOFF.md` (repo root) — aggregate summary
11. **Decisions:** `decisions/2026-05-19-v3-mb6-<slug>.md` for: Lighthouse baseline results, any Playwright emulation gotchas encountered

## Scope (hard limits)

- **DO** items above.
- **DO NOT** attempt to fake real-device behavior beyond Playwright's mobile emulation capabilities.
- **DO NOT** auto-block on Lighthouse failures — flag in report, JROM decides.
- **DO NOT** modify any application code — M-B6 is purely operator-prep + proxy evidence.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.**

```
STATUS: DONE — M-B6 operator-prep complete (checklist + Lighthouse + proxy screenshots); real-device smoke handed back to JROM
```

— /projcore (Claude, Opus, 2026-05-19)
