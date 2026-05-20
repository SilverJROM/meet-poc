---
date: 2026-05-20
type: feature-request
status: delivered
agent: projcore
qa_verification: 8/8 batches VERIFIED — backend 93/1-skip, Run 1 e2e 67/67, all 13 requirements observable in running app
---

# Meet UX + LLM + transcription suite (Run C / projcore-run-2026-05-19-fixc)

## JROM verbatim request

> "ok i want to add this when joining, lets have a mini modal test screen where user can test their camera, mic and speakers, and make the allow mic/camera much nicer ui rather that the ugly one showing right now, how does this work on other meeting software like zoom/meet/etc copy that. 2nd when i joined the call my camera lights on, but after leaving the call its still lights-on can you fix that, 3rd, when sharing the screen have the profiles of the users auto adjust and have a smaller form factor on the screen by being listed on the right side i think with an option to collapse them so that the share screen can have bigger room on the screen. next have a way to delete the past meetings, and transcripts, or download transcripts as well. on the setup lets have a configurable way to plug in an LLM to cleanup a transcript have an option to use claude/codex (headless) or one of the better ollama models (test this out). have a way to put in questions that the llm can process against the meeting transcipts automatically or by active command like summarize, get action items, etc. and have an option as well to change the transciber as well on the config."

Plus clarifications (verbatim) on device-test placement (before + during call), screen-share strip (vertical scroll + speaker-float/pulse), transcript download format (subtitle-style .txt not JSON), question library (auto + on-demand), models (codex = spark, claude = sonnet), and Ollama benchmark ranking (accuracy first, speed second, top 3).

## What was delivered (13 requirements, 8 batches)

| Req | Feature | Batch |
|---|---|---|
| R-C-1 | Pre-join device-test modal (cam preview + mic VU + speaker test + dropdowns) | FIXC2 |
| R-C-2 | In-call device dialog (gear icon, replaceTrack hot-swap) | FIXC2 |
| R-C-3 | Camera-light fix (stop all local tracks on leave) | FIXC1 |
| R-C-4 | Screen-share reflow (right strip, scroll, speaker-float + pulse, collapse) | FIXC3 |
| R-C-5 | Transcript download as subtitle-style .txt | FIXC4 |
| R-C-6 | Transcript delete (independent of audio) | FIXC4 |
| R-C-7 | Past-meetings delete = existing rooms-bulk-delete | FIXC4 |
| R-C-8 | LLM provider abstraction (Claude sonnet / Codex gpt-5.3-codex-spark / Ollama) | FIXC5 |
| R-C-9 | Settings UI for LLM default (star-to-set) | FIXC7 |
| R-C-10 | Ollama benchmark — top 3 (mistral-nemo:12b / gpt-oss:20b / gemma2:9b) | FIXC6 |
| R-C-11 | Question library CRUD | FIXC7 |
| R-C-12 | Question execution (auto on transcript-ready + manual Run) | FIXC7 |
| R-C-13 | Transcriber model dropdown (small/medium/large-v3) | FIXC8 |

## Open items for JROM (raised at hand-back, not blockers)

- **R-C-1 nuance:** the "Click Allow" permission-intro card auto-fires getUserMedia after 650ms in the default flow; explicit-Continue is gated behind `?manualDeviceSetup=1`. JROM may want to mandate explicit-Continue on hardware smoke.
- **R-C-4 caveat:** single video-sender topology means a *remote* peer sharing replaces their camera tile with the screen-share (local sharer unaffected). Dual-sender is a separate architecture change if JROM wants both.
- **R-C-3 final proof:** camera-LED-off is hardware-only — JROM verifies on real device.
- **Branch merge:** 8 stacked branches; `fix/meet-fixc8-transcriber-config` carries the complete run. Awaiting JROM merge decision.
