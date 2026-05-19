# Validation — Batch 5 (Recording)

**Verdict:** **PASS** (iteration 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

---

## Gate 1 — Artifact completeness

| Artifact | Present | Notes |
|---|:---:|---|
| `batch-5/changes.md` | ✓ | Mix architecture + filename-format extension note + threshold rationale |
| `batch-5/scenarios-implemented.md` | ✓ | S5.1, S5.2, S5.3 + backend coverage section |
| `batch-5/test-report.md` | ✓ | All five commands listed PASS |
| `batch-5/review.md` | ✓ | |
| `batch-5/independent-validation.md` | ✓ | |
| `batch-5/screenshots/` | ✓ | recording-indicator.png (27KB), dashboard-recordings-list.png (1.1MB — full-page list view) |
| `decisions/2026-05-19-b5-filesystem-recordings.md` | ✓ | filesystem-only index (no SQLite table); filename embeds roomId |
| `decisions/2026-05-19-b5-audio-threshold.md` | ✓ | ffprobe + 1KB size floor for S5.3 |
| `decisions/2026-05-19-b5-upload-auth-tradeoff.md` | ✓ | /upload unauthenticated (legacy parity); list/download require auth |
| `decisions/2026-05-19-b5-audio-context-defaults.md` | ✓ | AudioContext sample-rate handling |

## Gate 2 — Diff review

**New rule heeded:** codex committed BEFORE posting STATUS: DONE callback this time. 6 atomic commits on `feat/meet-rebuild-b5-recording`:

```
9dc8754 docs: append batch 5 callback
83ae09c docs: add batch 5 evidence artifacts
26f56b8 test: add B5 recording Playwright specs
8770c84 feat: wire client recording and dashboard list
8b2629f feat: add recording upload and listing API
8d3615c docs: add batch 5 dispatch context
```

Clean working tree post-callback.

Files touched (read each):
- **`backend/src/modules/recording/index.ts`** — `POST /upload` (no auth, matches legacy), `GET /api/recordings` (auth + owner-filter via filename), `GET /api/recordings/:filename/download` (auth + ownership check). Filenames written as `<timestamp>_<roomId>_<roomTitleSlug>_<rand6>.webm` (extension of R6.3 legacy shape; see deviation note below).
- **`backend/src/server.ts`** — mounts recording router.
- **`backend/tests/recording.test.ts`** — 4 vitest tests: upload binary + sanitize, list-auth-required, owner-filter+newest-first, non-owned-download-403. Real fs writes to temp dir via `MEET_RECORDINGS_DIR` env; `fs.utimesSync` for ordering proof.
- **`frontend/src/app/services/recorder.service.ts`** — `start(localStream, peerStreams)`, `addPeerStream`, `removePeerStream`, `stop` → Blob, `upload(blob, roomId)`. AudioContext with per-peer source nodes mixed into one `MediaStreamAudioDestinationNode`.
- **`frontend/src/app/services/recordings.service.ts`** — `GET /api/recordings` wrapper.
- **`frontend/src/app/components/controls-bar/`** — Record button enabled (was disabled in B4). Label flips Record ↔ Stop. Recording indicator now wired.
- **`frontend/src/app/pages/room/`** — calls `recorder.addPeerStream()` on `peer-joined`, `removePeerStream()` on `peer-left` (so late joiners are mixed into ongoing recordings).
- **`frontend/src/app/pages/dashboard/`** — Recordings section now populates from `recordingsService.list()`. Empty state preserved.
- **`e2e/tests/b5-recording/{record-start,record-stop-upload,record-mix}.spec.ts`** — S5.1, S5.2, S5.3 covered.

Out-of-scope check: no coturn, no CF Tunnel, no legacy PM2 changes. Clean.

## Deviation from literal R6.3 (documented, accepted)

R6.3 reads: *"POST /upload writes recordings/<timestamp>_<roomSlug>_<rand>.webm"*.

Codex's filename: `<timestamp>_<roomId>_<roomTitleSlug>_<rand>.webm`.

The deviation is a **strict extension** — both legacy components (`<timestamp>`, `<roomSlug>`, `<rand>`) are preserved; a `<roomId>` segment is inserted between `<timestamp>` and `<roomSlug>`. This is forced by the filesystem-only listing approach (no DB table): the listing endpoint needs to map each file to a room to enforce owner-only visibility, and the legacy roomSlug (sanitized room title) is not reliably reversible to a roomId.

Alternative was a SQLite `recordings` table; codex rejected per the B5 brief's recommendation. Decision is logged in `decisions/2026-05-19-b5-filesystem-recordings.md`.

**/projcore reads R6.3 as VERIFIED with note**: the requirement specifies the shape *of the filename's main parts* (timestamp + slug + rand), all of which are present. The roomId prefix is a necessary supporting element for the ownership model that R6.4 + R10.1 require together. Marking R6.3 VERIFIED.

## Gate 3 — Build verification

```
$ npm run build         → tsc clean, ng build clean (2.05s)
```

## Gate 4 — Targeted test pass

```
$ cd backend && npm test                       → 13 files / 23 tests / 4.46s (+1 file +4 tests vs B4)
$ npm test -w e2e -- tests/b5-recording        → 3 / 3 / 9.2s
$ npm test -w e2e -- tests/b3-shell-auth tests/b4-call-ui  → 16 / 16 / 8.9s (zero regression)
```

S5.3 (record-mix.spec.ts) is the heaviest at 4.8s — it runs the two-context P2P + 2.4s of fake-audio + ffprobe call. Acceptable.

## Gate 5 — Evidence quality (5Q)

| Q | Verdict | Evidence |
|---|---|---|
| Q1 Scenario coverage? | ✓ | record-start verifies indicator visible + label flip; record-stop-upload verifies file landed in `recordings/` + dashboard row appears; record-mix runs ffprobe on the downloaded `.webm` and asserts Opus audio stream. |
| Q2 Proof at right level? | ✓ | S5.1/S5.2 UI-level via real DOM; S5.3 supplements UI flow with binary-level ffprobe assertion. |
| Q3 Screenshots match claims? | ✓ | recording-indicator.png shows the indicator visible during recording; dashboard-recordings-list.png shows a populated list (1.1MB full-page render — large because the list is rendered against real data). |
| Q4 Scenario-to-test mapping? | ✓ | 3 scenarios = 3 specs = 3 Playwright tests. Backend recording.test.ts adds 4 supporting tests (not 1:1 with scenarios but covers all required server behaviors). |
| Q5 Requirement closure? | ✓ | R6.1: AudioContext mix verified in code + S5.3 ffprobe proves audio output. R6.2: MediaRecorder + upload verified by S5.2. R6.3: file lands on disk in `<timestamp>_<roomId>_<slug>_<rand>.webm` format. R6.4: indicator + dashboard list both green via screenshots + S5.1+S5.2. |

**§2.10 validator discipline:** `grep -r "page.setContent" e2e/tests/` no matches; all tests use real DOM, real DB, real FS writes. ✓

## Gate 6 — Requirement coverage matrix update

R6.1, R6.2, R6.3, R6.4 → **VERIFIED**.

## Gate 7 — Standing rules + decisions log

4 decision files all in correct location with proper frontmatter. **R6.3 filename extension is the one to surface to JROM** — not a problem, just a transparent autonomous call worth noting in case the cutover testing assumes the legacy format.

## Other observations

- **Test report mentions two iterative fixes during codex's own iteration:** "trailing underscore in sanitized title slugs" + "broad status locator and `e2e/` workspace-relative recording path" — these are codex's own pre-callback iteration, not /projcore corrections. Honest reporting; good.
- **Backend now has 4 modules:** auth, rooms, signaling, recording. Module-boundary matrix in project_specs.md § 5 still holds.
- **Legacy `voice.silverjrom.app`** still undisturbed.

## Verdict

**STATUS: PASS** — B5 recording complete. 4 new VERIFIED. **Matrix: 43/53 VERIFIED.** Only B6 (coturn + cutover) + Phase 2 remain. Cleared for B6 dispatch.
