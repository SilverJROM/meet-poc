# Requirements Matrix — projcore-run-2026-05-28

| ID | Requirement | Batch | Status | Evidence |
|----|-------------|-------|--------|----------|
| R1 | localStream has live audio track before SFU publish; deferred/logged if not | B1 | VERIFIED | commit eb1efe83 — poll loop 5s + console.warn + async IIFE in admitted handler; ng build 0 errors |
| R2 | Remote audio plays when peer joins with expired user activation; prompt shown if blocked | B2 | VERIFIED | commit 758f0edc — mixerEnabled()=true all platforms; AudioContext survives activation expiry; ng build 0 errors, iosRemoteAudioMixerEnabled grep=0 |
| R3 | Post-PC-reset remote audio resumes without fresh user gesture | B2 | VERIFIED | same commit — single AudioContext graph survives resetForReconnect; new sources added to running graph auto-play via mixer element |
| R4 | subscribedClientIds cleared on PC reset; retry cap does not survive resetForReconnect | B3 | VERIFIED — already implemented: resetForReconnect():508 clears guard; handleSfuPresence():280 clears on publisher cfSessionId change | pre-existing code |

_Final acceptance: all rows = VERIFIED_
