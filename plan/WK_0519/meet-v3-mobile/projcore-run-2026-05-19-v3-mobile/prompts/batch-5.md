# Batch M-B5 — iOS Safari specifics (MediaRecorder mime + timeslice + orientation)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree.
**⚠️ Hard reminder #2:** **No questions to JROM during Run 3.**

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** M-B5 (was M-B6 pre-consult; renumbered — iOS specifics minus the fullscreen helper which was deferred)
**Branch:** `feat/meet-v3-mb5-ios` — off M-B4 HEAD.

**Requirements assigned:**
- **R6.3** — MediaRecorder mime **capability list** fallback (not hardcoded mp4 per Codex review): iterate `['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']` (or similar order), pick first `isTypeSupported`. Upload/list/download accept `.mp4` filenames in addition to `.webm`. `X-Ext` header reflects the actual codec extension.
- **R6.6 (consult add)** — MediaRecorder `start()` called WITHOUT a timeslice argument (or with `>= 1000ms`) when iOS Safari detected — prevents zero-length segments per Claude-peer iOS quirk catch.
- **R6.7 (consult add)** — Orientation graceful landscape: don't lock portrait; verify existing CSS handles landscape (the call grid + bottom-sheet + docked controls). Add a single landscape spec.
- **R6.5** — `100dvh` (R1.1) implicitly covers iOS Safari address-bar bug — verified later via real-device acceptance (M-B6)

Read in full:
- `og-requirements.md` (R6)
- `scenarios.md` (S6.2-S6.4)
- `decisions/2026-05-19-v3-pre-dispatch-revisions.md` — R6.3 capability list + R6.6 timeslice + R6.7 orientation
- Existing `frontend/src/app/services/recorder.service.ts` (target for mime fallback)
- Existing backend `recording/index.ts` (already accepts `X-Ext` header — verify it accepts `mp4` value)
- `frontend/src/app/services/platform.service.ts` (M-B1 — use `isIOS()` for the timeslice branch)

---

## Expected (acceptance criteria)

### Step 1 — MediaRecorder mime capability list (R6.3)

In `recorder.service.ts`, modify the `start()` method (or wherever `new MediaRecorder` is called):

```typescript
private pickMime(): { mimeType: string; extension: string } {
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'mp4' },
    { mimeType: 'audio/mp4', extension: 'mp4' },
    { mimeType: 'audio/aac', extension: 'aac' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  // Fallback: let the browser pick
  return { mimeType: '', extension: 'webm' };
}
```

When uploading: send `X-Ext: <extension>` header so the backend names the file with the correct extension. Verify backend's `recording/index.ts` already accepts arbitrary alphanumeric `X-Ext` values (per Run 1 B5 implementation).

### Step 2 — MediaRecorder timeslice on iOS (R6.6)

In `recorder.service.ts` `start()`:
- If `platform.isIOS() === true`: call `mediaRecorder.start()` with NO timeslice argument (or `mediaRecorder.start(1000)` — codex picks based on whether the recorder needs chunked data events)
- Otherwise (non-iOS): existing behavior (whatever timeslice was used before, if any)
- Document why: iOS Safari + MediaRecorder + timeslice < 1000ms produces zero-length segments in the saved blob

### Step 3 — Orientation graceful landscape (R6.7)

Audit:
- Open `room.page.html` + `controls-bar.component.html` + `participant-sidebar.component.html` at landscape viewport (e.g. 844×390) at the mobile breakpoint
- Verify nothing is clipped / overlapping / unreadable
- Add a `@media (orientation: landscape) and (max-width: 1023px) { ... }` block ONLY if something breaks. Most likely: nothing needs adjustment since `100dvh` + the existing flexbox handle it. Document the audit in changes.md.

No portrait lock (per locked decision — graceful, not forced).

### Step 4 — Backend `recording/index.ts` audit (R6.3 extension)

Verify the existing upload handler accepts `X-Ext` values other than `webm`. Should be backward-compat per Run 1 B5 (the regex was something like `/[a-z0-9]/.gi`). If it's stricter, expand the regex to `/[a-z0-9]+/i` to accept `mp4`/`aac`/etc.

The list/download endpoints should already handle `.mp4` filenames if they parse extensions broadly. Verify with a quick read.

### Step 5 — Tests `e2e/tests/v3-mb5-ios/`

- `mime-capability-list.spec.ts` (S6.2 in scenarios.md):
  - Mock `MediaRecorder.isTypeSupported` via `page.addInitScript` to return `false` for `audio/webm*` and `true` for `audio/mp4`
  - Trigger a recording via the UI (host clicks Record button — though Run 3 doesn't change recording UI; record is via M-B3-still-shown record button on desktop OR test the service directly via `__meetDebug` if recording UI isn't reachable)
  - Verify `__meetDebug.lastRecordingMime === 'audio/mp4'` and the saved file has `.mp4` extension
  - Cleanup the test recording

- `ios-timeslice.spec.ts` (S6.x new): mock `platform.isIOS() === true` via the platform service or UA override; trigger record; verify `__meetDebug.lastRecorderTimeslice === undefined` (or whatever sentinel means "no timeslice")

- `orientation-landscape.spec.ts` (S6.7 new): set viewport to 844×390 (mobile landscape); navigate /room/<TEST_ROOM01_id>; assert controls bar visible, lobby preview not clipped (bounding boxes within viewport)

Backend regression: 45/45 unchanged (no BE changes expected; but verify `X-Ext: mp4` is accepted).

Run 1 desktop e2e regression at gate (40/40 mandatory).

### Build + deploy

```bash
npm run build -w frontend
pm2 restart meet-poc-fe
```

## Required artifacts

`projcore-run-2026-05-19-v3-mobile/batch-5/`:
1. `changes.md` — full template + mime candidate list table + iOS timeslice rationale + orientation audit result
2. `scenarios-implemented.md` (S6.2 + S6.6 + S6.7)
3. `test-report.md` (backend + M-B5 + Run 1 regression)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — mobile-landscape-controls-visible.png, mobile-landscape-lobby.png (orientation audit evidence)
7. **Decisions:** `decisions/2026-05-19-v3-mb5-<slug>.md` for: mime candidate ordering, timeslice value (or no-timeslice), orientation audit findings

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** implement fullscreen helper — DEFERRED to v3.5 per locked decision.
- **DO NOT** modify call layout or lobby — M-B3 + M-B4 own those.
- **DO NOT** modify backend beyond the X-Ext regex (if a change is even needed).

## Completion protocol

**COMMIT BEFORE STATUS: DONE.**

```
STATUS: DONE — M-B5 iOS specifics (capability-list mime + ≥1000ms timeslice + landscape orientation) + Run 1 regression 40/40
```

— /projcore (Claude, Opus, 2026-05-19)
