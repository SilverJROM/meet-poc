# Batch FIXC4 — Transcript delete + subtitle-style `.txt` download

**Persona:** Codex builder, `-s danger-full-access`. FIXC1+2+3 PASSED. R8.1 holds 13 consecutive batches. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirements R-C-5, R-C-6, R-C-7

JROM verbatim:
> "next have a way to delete the past meetings, and transcripts, or download transcripts as well."
> "the transcripts when downloaded make them the format human readable and not json file, sort of like how subtitles are written on a text file."

Spec rows:
- **R-C-5** Transcript download as subtitle-style `.txt`. Per-row Download button. Plain text: `[mm:ss] Speaker: text`. NO JSON download in UI.
- **R-C-6** Transcript delete independent of audio. Per-row Delete-transcript button. Removes `.transcript.json` only; recording audio + sidecar metadata remain. Recording-delete still cascades both.
- **R-C-7** Past meetings delete = existing rooms-bulk-delete (no new UI). Mark VERIFIED by the existing rooms-bulk-delete tests passing — no new code.

## Branch

```
git checkout -b fix/meet-fixc4-transcript-tools fix/meet-fixc3-share-reflow
```

## Implementation (your discussion-phase plan)

> Files: backend/src/modules/recording/index.ts, backend/tests/recording.test.ts, frontend/src/app/services/recordings.service.ts, frontend/src/app/pages/transcripts/*, new e2e/tests/v3-fixc4-transcript-tools/*.spec.ts.
> Approach: server-side GET /api/recordings/:filename/transcript.txt generates [mm:ss] Speaker: text; DELETE /api/recordings/:filename/transcript removes only .transcript.json. Recording delete keeps existing cascade.
> Gotcha: selected transcript UI must clear after delete and show "Transcribe".
> Tests: backend endpoint/delete cascade; Playwright download format and transcript-only delete.
> Commits: 1.

### Backend

1. **`GET /api/recordings/:filename/transcript.txt`** — auth required, ownership-gated. Reads `<filename>.transcript.json`, formats each `line` as:
   ```
   [mm:ss] Speaker Name: line text
   ```
   where `mm:ss` is `Math.floor(line.startMs / 1000)` formatted as `MM:SS` (e.g., `00:00`, `02:34`). If `name` is missing or `?`, use the literal string `Speaker`. Set `Content-Type: text/plain; charset=utf-8`, `Content-Disposition: attachment; filename="<basename>.txt"`. 404 if transcript JSON missing.
2. **`DELETE /api/recordings/:filename/transcript`** — auth + ownership. Removes ONLY `<filename>.transcript.json` and `<filename>.transcribe.lock` if present. Leaves the audio + `.meta.json` intact. 204 on success, 404 if no transcript.
3. **Existing recording-delete + bulk-delete:** no change — they already cascade both audio + transcript + sidecars (FIX-B4 work).
4. **Backend test additions** (`backend/tests/recording.test.ts` or `backend/tests/recording-transcript.test.ts`):
   - GET `.txt` returns expected subtitle-format string
   - GET `.txt` 404 when no transcript
   - DELETE transcript removes only the transcript file (audio + meta still present)
   - DELETE 404 when no transcript
   - Recording delete still removes audio + transcript both (regression)

### Frontend

1. **`recordings.service.ts`** — add `downloadTranscriptTxt(filename)` (triggers browser download via blob anchor or window.location to the new endpoint) + `deleteTranscript(filename)` (returns Promise<void>).
2. **`transcripts.page.{ts,html,scss}`** — per-row buttons:
   - **Download** (existing recordings with `hasTranscript: true` only) — calls `downloadTranscriptTxt`
   - **Delete transcript** (existing recordings with `hasTranscript: true` only) — confirms + calls `deleteTranscript`, then refreshes the list
   - After delete, if the deleted transcript was the open one, clear the viewer and the row reverts to showing "Transcribe" button (the `transcribeStatus` flips from `ready` → `failed` or whatever the new state is)
3. **Soft-light theme conformance** — match existing button styles.

### Test plan (Playwright)

`e2e/tests/v3-fixc4-transcript-tools/transcript-tools.spec.ts`:

1. **FIXC4.1 — Download button produces subtitle-style .txt.** Seed a recording + transcript via `e2e/fixtures/audio/synth-taglish.webm` + `.transcript.json` (already exists from FIXB4 work). Click Download, capture the download, assert content matches `^\[\d\d:\d\d\] [^:]+: .+` line format. At least 3 lines expected (Ari/Bela/Ari from the fixture).
2. **FIXC4.2 — Delete-transcript button removes only the transcript.** Click Delete, confirm, assert row's badge flips from "Ready" to "Failed" (or "Transcribe" button appears), assert recording is still in the list with audio intact via `GET /api/recordings` showing `hasTranscript: false`.
3. **FIXC4.3 — Viewer clears after delete.** Open transcript viewer, click Delete; assert viewer panel is hidden and no stale lines remain on screen.

Use `createRoomViaApi` for any room helpers; auto-clean via teardown.

## Gotchas codex flagged

- **Selected transcript UI must clear after delete.** If the currently-open transcript is the one deleted, the viewer panel must hide.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc4/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `screenshots/transcripts-with-download-delete.png` (transcripts page showing per-row buttons)

## Build + deploy

- Backend build + tests PASS
- Frontend build PASS
- `pm2 restart meet-poc-fe meet-poc-be`
- Live URL smoke: visit `/app/transcripts`, click Download on the synth-taglish row, verify `.txt` downloads

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] `npm test -w backend` PASS (≥63/63 — assuming +3 new transcript tests)
- [ ] `npm test -w e2e -- tests/v3-fixc4-transcript-tools --config=playwright.live.config.ts --workers=1` PASS
- [ ] Run 1 regression PASS (the 55-spec set used in FIXC3 + new FIXC4 tests) — R8.1's 14th consecutive batch

## Completion

End with the STATUS: DONE block. I'll validate independently before dispatching FIXC5.
