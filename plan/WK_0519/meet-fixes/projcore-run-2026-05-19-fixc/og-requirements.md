# Run C — Meet UX, Bugs, LLM Analysis

## Source (JROM verbatim, 2026-05-19)

> ok i want to add this when joining, lets have a mini modal test screen where user can test their camera, mic and speakers, and make the allow mic/camera much nicer ui rather that the ugly one showing right now, how does this work on other meeting software like zoom/meet/etc copy that. 2nd when i joined the call my camera lights on, but after leaving the call its still lights-on can you fix that, 3rd, when sharing the screen have the profiles of the users auto adjust and have a smaller form factor on the screen by being listed on the right side i think with an option to collapse them so that the share screen can have bigger room on the screen. next have a way to delete the past meetings, and transcripts, or download transcripts as well. on the setup lets have a configurable way to plug in an LLM to cleanup a transcript have an option to use claude/codex (headless) or one of the better ollama models (test this out). have a way to put in questions that the llm can process against the meeting transcipts automatically or by active command like summarize, get action items, etc. and have an option as well to change the transciber as well on the config. please read these new requirements give me a feedback and lets discuss before you work with codex (create a new session that you will exit after the work is done) go

## JROM Clarifications (verbatim, 2026-05-19)

> decisions:
> 1. yes have the users able to test out their device settings before entering, and also even in the middle of the call, have a ... or setting icon where they can still change their device settings or test it.
> 3. vertical strip with a scroll, but have the ones speaking on top or sort of vibrate them to know they are talking.
> 4. the transcripts when downloaded make them the format human readable and not json file, sort of like how subtitles are written on a text file.
> 5. yes have a way to add a question library that we can setup and have it run either automatically or on-demand using the LLM choices.
> i know the benefits of using the models, but i want to have the options there so that we can test them out. for codex add spark, and for claude use sonnet
>
> answers:
> 1. rooms for now
> 2. both, see my answer on decisions
> 3. just list them and have me an option to change default by the star or something
> 4. yes try to generate a text and have them perform that task, pick top3 with rating of accuracy (first), speed 2nd
> 5. ok, does not matter to me

## Numbered requirements (acceptance gate)

| # | Requirement | Verification |
|---|---|---|
| R-C-1 | **Pre-join device test modal.** Camera preview tile, mic VU meter, speaker test tone, device dropdowns for cam/mic/speakers. Replaces the raw browser permission UX with a styled custom overlay before the browser prompt. Mirrors Zoom/Meet green-room pattern. | Playwright: visit /join/<room>, modal appears with all four controls; selecting a device persists into the room. Screenshot. |
| R-C-2 | **In-call device dialog.** Gear / `...` icon in controls-bar opens the same dialog as R-C-1. User can switch camera/mic/speaker mid-call; published track hot-swaps without dropping the connection. | Playwright: join call, open dialog, swap mic, assert peer connection survives + active track replaced. |
| R-C-3 | **Camera-light bug fix.** On leave (Leave button, browser close, tab close), every local MediaStreamTrack (camera + mic + screen-share) `.stop()` fires before peer-connection teardown. | Playwright: join + leave + assert no track in `readyState: 'live'` lingers; on bare metal, JROM confirms camera LED turns off. |
| R-C-4 | **Screen-share layout reflow.** When local or remote share active: participant tiles collapse into a vertical right-side strip with scroll. Active speakers float to top; speaking tile pulses subtly. Main area resizes to fit the share. Collapse toggle hides the strip entirely. | Playwright: with 4 participants + share, assert layout class swap + tile order changes when speaker changes + collapse toggle hides strip + main area expands. |
| R-C-5 | **Transcript download as subtitle-style .txt.** Per-row Download button on /app/transcripts. File is plain text: `[mm:ss] Speaker: text` lines, one per transcript line. NO JSON download in UI. | Playwright: click Download, assert downloaded file matches the `[mm:ss] Speaker: text` format with all lines. |
| R-C-6 | **Transcript delete (independent of audio).** Per-row Delete-transcript button on /app/transcripts. Removes `.transcript.json` only; recording audio + sidecar metadata remain. Recording-delete still cascades both. | Playwright: delete transcript, assert audio remains + status flips to "Transcribe". Backend test: bulk-delete recording still removes transcript too. |
| R-C-7 | **Past meetings delete.** Out of scope as separate UI — rooms-page delete (existing) is the canonical mechanism. No change required for R-C-7; mark VERIFIED by existing rooms-bulk-delete passing. | Existing rooms-bulk-delete tests. |
| R-C-8 | **LLM provider abstraction with three implementations.** Backend LLMService with: (a) `claude-cli` calling `claude -p --model sonnet`, (b) `codex-cli` calling `codex exec --model gpt-5.3-codex-spark`, (c) `ollama` calling local HTTP. Per-provider availability check at boot logs presence/absence. | Backend test: each provider stubbed/mocked + return values flow through. Health endpoint reports {claude, codex, ollama} availability. |
| R-C-9 | **Settings UI for LLM choice with star-default.** Lists all three providers. Star icon sets the global default. Per-question override available in question-library UI. | Playwright: open settings, star Ollama → default flips → next manual Run uses Ollama. |
| R-C-10 | **Ollama benchmark report.** Codex picks 3-5 local Ollama candidates (e.g. llama3.1:8b, qwen2.5:14b, mistral-nemo:12b, etc.), runs the same "summarize + action items" task on a real transcript, rates them by accuracy first, speed second. Top-3 with scores committed to `decisions/2026-05-19-fixc-ollama-benchmark.md`. Models auto-pulled via `ollama pull`. | Doc committed + `ollama list` shows top-3 models present. |
| R-C-11 | **Question library — CRUD.** Backend stores question entries: `{id, name, prompt, autoRun:bool, providerOverride:nullable, isDefault:bool}`. CRUD endpoints. Settings page UI for list/edit/create/delete + star to set default. | Backend tests for CRUD. Playwright: create question, edit, star, delete. |
| R-C-12 | **Question execution — auto + manual.** On transcript-ready event, all `autoRun:true` questions execute and write `<audio>.analysis.<question-slug>.json` sidecars. Transcript-view page shows per-question Run button + results panel. Results persist across reloads. | Playwright: mark question autoRun, finish a recording, assert sidecar appears + view shows result. Manual Run also covered. |
| R-C-13 | **Configurable transcriber model.** Settings dropdown for Whisper model size: `small` / `medium` (current default) / `large-v3`. transcribe.py reads model from env or config; download triggered on first use. | Playwright: change to small, force re-transcribe, sidecar reports model=small. |

## Scope (hard limits)

- DO ship R-C-1 .. R-C-13.
- DO NOT add diarization (pyannote.audio) — Phase 2 deferred.
- DO NOT add cloud Whisper or OpenAI API path — local only.
- DO NOT auto-pull every Ollama model at boot — only the top-3 benchmarked.
- DO NOT add per-meeting LLM cost tracking — not in this run.
- DO NOT replace the existing rooms-bulk-delete UI — past-meetings delete maps onto that.

## Models

- Claude provider: `sonnet` (`claude -p --model sonnet`)
- Codex provider: **`gpt-5.3-codex-spark`** (`codex exec --model gpt-5.3-codex-spark`). Discussion-phase smoke confirmed that the literal alias `spark` is rejected on this ChatGPT account; the full model ID resolves correctly.
- Ollama provider: configurable per question, benchmark picks the curated top 3
- Whisper: `medium` default, `small`/`large-v3` selectable

## Cross-cutting

- **Theme:** soft-light (already shipped this week) — every new UI surface conforms.
- **Auth:** existing session-cookie auth; new LLM endpoints require auth.
- **Test pollution cleanup:** every test that creates rooms uses `createRoomViaApi` (tracked in `.test-rooms.json`); global-teardown cleans them.
- **Persistent rooms:** `TEST_ROOM01` (slug `3f324d8be763`) must remain after the run.
