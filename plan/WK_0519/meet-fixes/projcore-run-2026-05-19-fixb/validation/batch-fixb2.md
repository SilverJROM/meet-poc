# Validation — FIX-B2 (Transcript speaker-tagging via sidecar metadata)

**Verdict:** **PASS** (iter 2 — commit-before-DONE breached on iter 1, single-gap correction sent, recommit clean).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present:
- `batch-fixb2/changes.md` (verbatim user report + schema + scope delivered + exclusions honored)
- `batch-fixb2/scenarios-implemented.md`
- `batch-fixb2/test-report.md` (backend 54/54, FIX-B2 e2e 4/4, Run 1 40/40, with honest note about an admitted-shape regression caught + reverted during testing)
- `batch-fixb2/review.md`
- `batch-fixb2/independent-validation.md`
- `batch-fixb2/screenshots/recordings-with-meta-badge.png` — substantive evidence: 4 recordings, each with a blue "Speakers: N" badge (1 for single-peer, 2 for two-peer + peer-leave + list-enrichment recordings)
- 1 decision: `2026-05-19-fixb2-transcript-metadata.md`

## Gate 2 — Diff review

3 atomic commits after the single-gap correction:
```
a1db44c docs: add FIX-B2 evidence artifacts
f3e9e6f test: add FIX-B2 transcript metadata coverage
e8242c6 feat: add transcript speaker metadata sidecars
```

**Iter 1 (FAIL):** Same pattern as M-B6 + FIX-B3 — codex sent DONE callback with files staged-but-not-committed (7 staged + 1 unstaged + folder untracked). Single-gap correction sent per §1.3.4; recommit clean. **Third consecutive batch hitting this pattern this session** — flagged for /jweek.

Honest engineering note from codex's own test-report.md: during initial backend full-suite run, codex added `sessionId` to the legacy `admitted` WS message and it broke wire-format identity. Codex caught it, reverted that change, and re-routed sessionId through the existing `recording-started` message (preserving legacy `admitted` shape). This is exactly the kind of proactive QA I want to see — codex didn't gloss over the regression, surfaced it.

Files touched:
- `backend/src/modules/recording/index.ts` — new `POST /upload-metadata` endpoint + `GET /api/recordings` enrichment (hasMetadata + speakerCount); metadata cleanup on recording delete
- `backend/tests/recording.test.ts` — +3 new tests (16/16 now)
- `frontend/src/app/services/active-speaker.service.ts` — extended with 8Hz `activeFrame` signal + local-peer analysis
- `frontend/src/app/services/recorder.service.ts` — participant snapshot + join/leave updates + collapsed segments with 250ms floor
- `frontend/src/app/services/recordings.service.ts` — uploadMetadata method + List enriched type
- `frontend/src/app/pages/room/room.page.ts` — start/stop wiring + peer-join/leave notifications to recorder
- `frontend/src/app/pages/recordings/recordings.page.{html,scss}` — "Speakers: N" badge polish (item 5 of the brief)
- `e2e/tests/v3-fixb2-transcript/transcript-tagging.spec.ts` — 4 tests

## Gate 3 — Build

PASS — codex confirmed `npm run build` + my live-URL e2e runs against the deployed bundle.

## Gate 4 — Targeted + regression (independent rerun)

Single combined run via `npm test -w e2e -- tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`:

- **FIX-B2 spec: 4/4 PASS** in 1.3m total:
  - FIX-B2.1 single-peer recording writes sidecar metadata (4.4s)
  - FIX-B2.2 two-peer recording captures both speakers in segments (5.0s) ← **the load-bearing test**
  - FIX-B2.3 mid-recording peer leave is captured (6.8s)
  - FIX-B2.4 recordings list exposes hasMetadata and speakerCount (1.7s)
- **Run 1 desktop regression: 40/40 PASS** — **R8.1 holds for the 9th consecutive batch** (M-B1 → M-B6 → FIX-B1 → FIX-B3 → FIX-B2)
- **My independent backend regression:** `npm test -w backend` → **54/54 PASS in 13.7s** (was 51, +3 from new sidecar tests)

## Gate 5 — Evidence quality (5Q)

- **Q1 real DOM or fake?** ✓ All 4 e2e tests drive real Playwright browser contexts against live `voice.silverjrom.app`. Recording-bytes upload through real BE; sidecar JSON written to real disk; subsequent assertions read the disk file back via the list endpoint.
- **Q2 debug-hook abuse?** ✓ No new `__meetDebug` hooks needed beyond what already exists. Tests observe the recording file + sidecar file directly via `GET /api/recordings` enrichment.
- **Q3 screenshot evidences the right thing?** ✓ `recordings-with-meta-badge.png` shows 4 recordings each with a blue "Speakers: N" badge — captures both the badge polish (item 5) AND the data flow that produced different speaker counts per recording (1 vs 2).
- **Q4 scenarios=tests?** ✓ 4 distinct scenarios → 4 distinct tests, each with non-trivial post-conditions (schema validation, participants array shape, segments array with clientIds, leftAtMs window).
- **Q5 live URL serves it?** ✓ pm2 restart + live curl confirm by codex; my own e2e runs are against the live URL.

### Hygiene

- Codex left the working tree clean post-recommit (3 atomic commits).
- My regression rerun churned v2 screenshots — restored.

## Gate 6 — Matrix

N/A — fix run.

## Gate 7 — Decisions

1 decision (`2026-05-19-fixb2-transcript-metadata.md`) — captures the four sub-decisions cleanly:
- Sidecar JSON vs DB table (sidecar — matches file-backed recordings model)
- Mixed audio + active-speaker timeline vs per-peer stems (mixed + timeline — minimal approach agreed in triage)
- 250ms segment floor (filters 8Hz jitter)
- Best-effort metadata upload (audio is primary artifact; metadata failure doesn't lose the audio)

## Verdict

**PASS** — sidecar `<recording>.meta.json` schema lives next to every recording with stable clientId/displayName/host-flag participants + collapsed active-speaker segments. Future transcription pipeline can join transcript timestamps to participant names. JROM's transcript-tagging ask is closed; STT integration remains a separate future run.

**Fix run complete.** All 3 batches now PASS:
- ✅ FIX-B1 PASS — signaling race + UA-gate + controls contrast
- ✅ FIX-B3 PASS — recordings batch + single delete
- ✅ FIX-B2 PASS — transcript speaker-tagging metadata

R8.1 desktop regression held for **9 consecutive batches** end-to-end. JROM can re-test the full call → record → list → delete → (future-transcribe) pipeline against the live URL.
