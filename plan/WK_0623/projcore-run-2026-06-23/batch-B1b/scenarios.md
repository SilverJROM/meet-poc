# Batch B1b — Scenarios

Requirements: R1.5 R1.6 R1.7 R1.8 R1.9 (backend only)

## S1 — OpenRouter cloud transcription (mocked)

**Given** a per-user recording with `participant.json` owner `Host`  
**And** `transcriptionProvider=openrouter` and `OPENROUTER_API_KEY` set  
**And** OpenRouter HTTP is mocked to return `verbose_json` words  
**When** `POST /api/recordings/:filename/transcribe` with `{ provider: 'openrouter', model: 'openai/whisper-1', force: true }`  
**Then** `<file>.transcript.openrouter-openai-whisper-1.json` is written  
**And** payload has `provider: 'openrouter'`, `model: 'openai/whisper-1'`  
**And** every line/word `name` equals `Host` (owner-only, zero `?`)

## S2 — Missing API key fail-safe (R1.9)

**Given** `transcriptionProvider=openrouter` and `OPENROUTER_API_KEY` unset  
**When** on-demand transcribe is triggered  
**Then** a warning is logged, no transcript file is created, lock is cleaned up  
**And** the API returns `200 { ok: true, status: 'started' }` (recording path never errors)

## S3 — Versioned storage coexistence (R1.8)

**Given** two version sidecars: `local-small` and `local-medium`  
**And** primary pointer set to `local/small`  
**When** `GET .../transcript` → returns small version  
**And** `GET .../transcript/versions` → lists both  
**When** `DELETE .../transcript/versions?provider=local&model=small`  
**Then** small file is removed, medium remains  
**When** `PUT .../transcript/primary` with `{ provider: 'local', model: 'medium' }`  
**Then** `GET .../transcript` resolves medium content

## S4 — Legacy back-compat

**Given** only a bare `<file>.transcript.json` (pre-versioning)  
**When** `GET .../transcript` or `named-transcript` merge runs  
**Then** legacy file is served as the primary transcript

## S5 — Local model passthrough (R1.5)

**Given** provider `local` and `transcriberModel=small`  
**When** manual transcribe runs via fake worker  
**Then** `<file>.transcript.local-small.json` is written with `provider: 'local'`, `model: 'small'`