---
date: 2026-06-23
slug: transcription-architecture
source: projcore
issue: "#1 — transcription quality / phantom speaker / pluggable + versioned transcribers"
status: locked-by-JROM (interview 2026-06-23, pre-call)
---

# Decision — Transcription architecture rework (current app)

## JROM's verbatim ask (Issue #1)
> "the transcription on my recent call with peer2 the transcript are a bit trash, and it seems like its
> detecting another party and being marked as ? on the transcript ... we should record each voice
> individually and add time stamps on it and aggregate the transcription together so there is no
> overlapping and no phantom transcription ... whisper is not that accurate, can we have a way to plug in
> a better transciber ... can we have a version of the transcription ... so i can transcribe it with
> different models and see w/c is better"

Interview answers (2026-06-23):
1. The bad transcript he deleted showed **silverjrom / peer2 / `?`** — a phantom 3rd speaker on a 2-person call.
2. Retire the mixed-file diarization: **agreed.**
3. Better transcriber: **both** local (bigger Whisper) and cloud, pluggable.
4. Versioned transcription: **yes** — add a new transcription, delete a previous one, per meeting, pick the better.
5. Audio is clean (he uses a headphone). Even if Peer2's side bleeds, it must stay **under Peer2's transcript** —
   no 3rd phantom user, ever.
6. **Tagalog + English** must both be accepted (bilingual / code-switching).
7. Scope: **current app only** (not CFBASE).

## Root cause (investigated, confirmed in code)
- `backend/scripts/transcribe.py::speaker_for_ms()` re-attributes **every transcribed word** to a speaker by
  testing which active-speaker **segment window** the word's timestamp falls into. Words landing in gaps or
  overlaps → labeled `?`. Whisper **hallucinates phantom phrases during silence/noise** (faster-whisper
  known failure); those land in gaps → the phantom `?` "3rd party."
- A **clean path already exists**: `GET /api/recordings/named-transcript/:sessionId` transcribes each
  **per-person file** (`*.participant.json` with `isPerUser:true`) and labels every line with that file's
  owner — no diarization guessing, no `?` possible — then merges all lines sorted by `startMs`.
- `recorder.service.ts` already records **both** a mixed webm (`dest.stream`) AND per-person webms
  (`perUserRecorders`). So "record each voice individually" is already happening.

## Locked decisions

**D-1. Per-person is the SOLE transcription source.**
Only per-person files (`isPerUser:true`) are ever transcribed. Each file's words are ALL attributed to that
file's owner — no per-word segment lookup. The phantom `?` becomes structurally impossible.

**D-2. Retire mixed-file diarization.**
The mixed webm remains a downloadable full recording but is **never transcribed**. Remove/neutralize
`speaker_for_ms()` segment attribution; a per-person transcript's speaker = the file owner, period.

**D-3. Timestamped + aggregated transcript.**
Keep the `named-transcript` merge (per-line `startMs`/`endMs`, sorted, owner-labeled). This is the
canonical meeting transcript surface.

**D-4. Pluggable transcriber — local Whisper (free) + OpenRouter (one key → many STT models).**
Build a real provider seam (the current `thirdparty` path is an inert stub that logs "integration pending").
- **Local**: faster-whisper with selectable model (`small` / `medium` / `large-v3`) — already wired, stays
  the **free default**.
- **Cloud = OpenRouter** (decided 2026-06-23, see Investigation note). One `OPENROUTER_API_KEY` unlocks a
  menu of STT models via its OpenAI-compatible `/api/v1/audio/transcriptions` endpoint: OpenAI Whisper-1 /
  Whisper-large-v3 / Whisper-large-v3-turbo / gpt-4o-transcribe / gpt-4o-mini-transcribe, Google Chirp 3,
  Groq Whisper. This single integration satisfies the **per-transcription model selector** (JROM:
  "i want an option to select models on the transcription itself to try it").
- **Codex subscription is NOT a path**: codex CLI is coding-only (no audio); the ChatGPT/codex sub does not
  grant the OpenAI audio API. Ruled out.
- Key in `.env` (`OPENROUTER_API_KEY`), never in code/chat. Provider unset / no key = logged no-op, never
  errors the call path (preserve current fail-safe behavior). 25 MB/file endpoint limit → chunk long tracks.

### Investigation note (2026-06-23)
- Local check: codex CLI 0.141.0 has no audio/transcribe capability; `backend/.env` + root `.env` contain no
  OpenAI/OpenRouter/Deepgram keys (root .env names: PEER2_MACHINE, SFU_APP_ID, SFU_TOKEN, TG_APP_TOKEN,
  TURN_ID). `TG_WEBHOOK_SECRET` also absent (needed for Issue #3).
- OpenRouter (verified via web, 2026): dedicated `/api/v1/audio/transcriptions`, Whisper + gpt-4o-transcribe
  + Google Chirp 3 + Groq, OpenAI-compatible, 25 MB/file. Sources in the run report / list entry.

**D-5. Bilingual (Tagalog + English).**
Local: keep `language=None` auto-detect + bilingual `initial_prompt`; default model bumped toward accuracy
for real calls. Cloud vendor MUST support Tagalog+English code-switching (gate vendor choice on this).

**D-6. Versioned transcription (per recording / per meeting).**
A transcript is stored per **(recording × provider × model)** instead of a single overwrite. Host UI on the
meeting/transcript page can: **Add transcription** (pick provider+model), **view/compare**, **delete one**,
and **mark one as primary**. Re-running a different model does NOT destroy the prior one.

## Resolved (2026-06-23)
- **O-1 cloud vendor → RESOLVED: OpenRouter** (not OpenAI/Deepgram direct). One key, many STT models,
  OpenAI-compatible endpoint. Codex-sub path ruled out. JROM to provision `OPENROUTER_API_KEY` when ready.
- **O-2 default local model → keep `medium`** as default, `large-v3` selectable (JROM: 3-B "just show it").
- **O-3 versioning UX → minimal first** (list/add/delete/primary), diff viewer later (JROM: 3-C "yes").

## Firm requirement (added 2026-06-23)
- **Per-transcription model selector in the UI** — when adding a transcription, host picks the engine:
  local Whisper (small/medium/large-v3) OR an OpenRouter STT model — so models can be tried + compared.
  This extends D-6 (versioning) to span both local sizes and cloud models.
