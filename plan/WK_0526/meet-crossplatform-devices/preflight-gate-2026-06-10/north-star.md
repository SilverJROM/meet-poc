# North-star — Pre-join Device Gate ("green room") — 2026-06-10
## Goal (JROM): no user enters a call until mic+speaker are authorized AND validated working, with a real connection check — but the UX feels like Google Meet / Zoom (smooth, non-technical, friendly). Stop the silent "in-call but never publishes / can't be heard" embarrassment.
## Locked design
1. DEPTH = full: (a) permission, (b) live mic-energy validation, (c) connection/publish confirmation. Smooth, client-side, non-technical wording.
2. DEVICES: MIC + SPEAKER mandatory+validated; CAMERA optional (validate/preview only if access granted).
3. FAILURE = HARD BLOCK (Join disabled / cannot enter) with friendly plain-language reason + Retry + guidance. Applies to everyone incl host.
## Build on existing scaffolding (do NOT reinvent)
- State machine room.page.ts:100 (lobby→connecting→waiting-room/knocking→in-call); startLobbyPreflight; classifyMicCapture/nextMicWarningState/lobbySelfTestFlag (B5 lobby mic self-test ALREADY detects silent mic); micSilentWarning(+Message) friendly text; speakerTest (speakerTestCount, line ~1043); verifyInitialCaptureEnergy (B2a); publishSfuOnceAfterAdmit (1605) + initial-publish retry (1563).
## The gate (extend lobby into a green-room)
- MIC gate: reuse lobby self-test → Join DISABLED until real capture energy confirmed (live "we can hear you" meter ✓). Friendly block if silent/denied.
- SPEAKER gate: a soft test tone on the selected output; confirm output works (auto or 1-tap "I heard it"); friendly block if it can't play.
- CAMERA: optional preview if granted; never blocks.
- PERMISSIONS: requested smoothly; denial → friendly "allow mic to join" + retry.
- CONNECTION confirmation (anti-Joanne, the critical one): on Join, show "Connecting your audio…"; the publish-after-admit MUST reach localPublishState 'published' (use the existing retry) — the user is NOT shown as fully in-call until publish is confirmed. If it can't connect after retries → HARD friendly failure "We couldn't connect your audio — Retry" (NEVER silently sit in-call with hasPc=false). This closes the Joanne 4b14bc30 failure (hasPc=false, never published, no error shown).
## UX bar: Google Meet / Zoom green room. Calm, minimal, reassuring. No WebRTC/jargon to the user. Mobile-friendly.
