# Batch plan — B1: Transcription rework (current app)

> Gated: do NOT start until JROM says "go" after his 2026-06-23 live call.
> Atomic tasks (<30min each, ~1-3 tests, tight diff). Verifier ≠ fixer — projcore validates each.
> Covers req-matrix Issue #1 rows R1.1–R1.10.

## Affected surfaces (from investigation)
- `backend/scripts/transcribe.py` — `speaker_for_ms()` (phantom source), `build_lines()`, model selection.
- `backend/src/modules/recording/index.ts` — `named-transcript` aggregator, `spawnTranscription`,
  `transcribeViaThirdParty` (inert stub at ~L558), provider/model selection (~L504, L540, L576),
  on-demand endpoints (`/api/recordings/:filename/transcribe`, `/session/:sessionId/transcribe`).
- `backend/src/modules/questions/store.ts` — `TranscriptionMode`, `TranscriptionProvider`, transcriber model KV.
- `frontend/src/app/pages/transcripts/transcripts.page.{ts,html}` — transcript surface (versioning UI).
- `frontend/src/app/pages/settings/settings.page.*` — provider/model selectors.
- `frontend/src/app/services/recordings.service.ts`, `questions.service.ts` — client calls.

## Task list (atomic)

**B1-T1 — Kill the phantom `?` (per-person owner-only labeling).**
In `transcribe.py`, when transcribing a per-person file, attribute ALL words to the file owner
(`participant.json` displayName/clientId); remove the `speaker_for_ms` segment lookup for per-person files.
No `?` can be emitted. (R1.1, R1.2)
Test: transcribe a per-person fixture → every line.name == owner, zero `?`.

**B1-T2 — Mixed file is never transcribed.**
Ensure only `isPerUser:true` files are enqueued by `transcribeSessionRecordings` /
`maybeAutoTranscribeSession`; mixed file stays downloadable only. (R1.3)
Test: session with mixed+per-person files → only per-person get transcript jobs.

**B1-T3 — Canonical merged transcript = named-transcript.**
Make the meeting transcript surface consume `named-transcript/:sessionId` (timestamped, owner-labeled,
sorted). Confirm interleaving + `[mm:ss] Name:` format. (R1.4)
Test: two per-person transcripts merge in time order.

**B1-T4 — Local model selection end-to-end.**
Verify host model choice (small/medium/large-v3) flows to `WHISPER_MODEL` and is recorded in the
transcript payload (`model` field already present). Surface model in UI. (R1.5)

**B1-T5 — Real cloud STT provider = OpenRouter (resolved).**
Replace the inert `transcribeViaThirdParty` stub with an **OpenRouter** integration via its
OpenAI-compatible `POST /api/v1/audio/transcriptions` endpoint. One `OPENROUTER_API_KEY` (in `.env`) →
selectable models: Whisper-1 / Whisper-large-v3 / -turbo / gpt-4o-transcribe / gpt-4o-mini-transcribe /
Google Chirp 3 / Groq. Normalize response to our `{lines, words}` schema, owner-labeled (file owner),
timestamped. Handle 25 MB/file limit (chunk long tracks). (R1.6, R1.7)
Test: mocked HTTP → normalized owner-labeled transcript; missing key → logged no-op (R1.9).

**B1-T6 — Bilingual validation.**
Confirm Tagalog+English path (local: `language=None` + bilingual prompt; cloud: vendor multilingual).
(R1.7) Test: bilingual sample retains both languages.

**B1-T7 — Versioned transcription storage.**
Store transcripts keyed by (recording × provider × model) instead of single overwrite, e.g.
`<file>.transcript.<provider>-<model>.json`; track a "primary" per meeting. Migrate read paths. (R1.8)
Test: two model runs coexist; delete one leaves the other; primary resolves.

**B1-T8 — Versioning UI.**
Transcripts page: list versions, "Add transcription" (provider+model picker), delete one, mark primary.
(R1.8) Test: add→2 versions, delete→1, primary switch reflects.

**B1-T9 — Capstone: real-shape validation.**
Re-transcribe JROM's per-person files (or a fresh 2-person call) across ≥2 models/providers; confirm
zero phantom, correct bilingual content, versions coexist, international path untouched. (R1.1, R1.7, R1.8, R1.10)

## Sequencing
T1→T2→T3 (phantom kill + per-person-only + merge) is the **highest-value, smallest-risk** slice and
likely resolves the visible pain on its own. T4 trivial. T5–T6 (cloud vendor) and T7–T8 (versioning) are
additive. T9 capstone last. Recommend shipping T1–T3 first, validating on real audio, then T4–T8.

## Open items blocking parts of B1 (need JROM)
- O-1 cloud vendor (blocks T5). O-2 default local model (affects T4 default). O-3 versioning UX depth (T8).
