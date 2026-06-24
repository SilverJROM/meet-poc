---
date: 2026-06-23
slug: b1b-autonomous
source: implementer
batch: B1b
---

# Autonomous decisions — Batch B1b

## D-B1b-1: `thirdparty` → `openrouter` with read-time alias

Kept `thirdparty` as a read/write alias mapping to `openrouter` so existing DB rows and frontend settings (B1c not yet shipped) do not break. New canonical value is `openrouter`.

## D-B1b-2: 25 MB over-limit handling

Files exceeding OpenRouter's 25 MB limit are **skip + log** (no error on recording path). Audio chunking deferred to `queue.md` follow-on row per brief.

## D-B1b-3: Cloud model storage

Added `cloud_transcriber_model` KV setting (default `openai/whisper-1` or `OPENROUTER_MODEL` env). On-demand transcribe also accepts `model` in request body for per-run overrides (B1c UI will use this).

## D-B1b-4: Legacy `.transcript.json` as implicit primary

Bare `<file>.transcript.json` remains readable when no primary pointer exists — treated as a legacy version in `resolvePrimaryTranscriptPath()` fallback chain.