# Batch B1c — Scenarios

Requirements: R1.5 (UI) R1.8 (UI)

## S1 — List transcript versions with primary marker

**Given** a recording with two version sidecars (`local/small`, `local/medium`) and primary `local/small`  
**When** host opens the track transcript on `/app/transcripts`  
**Then** the Versions panel lists both entries labeled `provider / model`  
**And** `local / small` shows a **Primary** badge  
**And** the main transcript viewer header shows `local / small`

## S2 — Add transcription with provider + model picker

**Given** a recording with at least one existing version  
**When** host selects provider `openrouter` and model `openai/whisper-1`  
**And** clicks **Add transcription**  
**Then** `POST /api/recordings/:filename/transcribe` is sent with `{ force: true, provider: 'openrouter', model: 'openai/whisper-1' }`  
**And** existing versions remain (no overwrite)  
**And** polling refreshes the versions list when transcription completes

## S3 — Delete a version

**Given** two transcript versions exist  
**When** host clicks **Delete** on one version and confirms  
**Then** `DELETE .../transcript/versions?provider=&model=` is called  
**And** the other version remains in the list

## S4 — Set primary version

**Given** two transcript versions and primary is `local/small`  
**When** host clicks **Set primary** on `local/medium`  
**Then** `PUT .../transcript/primary` is sent with `{ provider: 'local', model: 'medium' }`  
**And** the Primary badge moves to `local/medium`  
**And** the main transcript viewer reloads medium content

## S5 — Curated model lists

**Given** provider `local` selected in Add transcription  
**Then** model options are `small`, `medium`, `large-v3`  
**Given** provider `openrouter` selected  
**Then** model options are `openai/whisper-1`, `openai/gpt-4o-transcribe`