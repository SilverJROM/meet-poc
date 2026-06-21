# IMPLEMENT — Pre-join Device Gate (you are SONNET, the implementer). Verifier!=fixer (sonnet/opus/haiku red-team + projcore validate independently — do NOT self-certify).
## FIRST tool call = callback: printf '[projcore callback] IMPL STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <ABS>/callbacks.md   (then plan, WAIT for APPROVED-PLAN, implement, then STATUS: DONE)
## Read IN FULL: DESIGN-SPEC.md (the contract), og-requirements.md (R1-R8), investigation/{sonnet,opus,haiku}-investigation.md (root cause + your own design).
## Build PART 1 -> 2 -> 3 per DESIGN-SPEC. Highest priority = PART 1 (kill the silent never-publish: gate in-call on publishStatus==='published', never-silent guards, verify real audio track, observability publishTriggerCount+roomState). Then PART 2 (green-room gate + device-config-test panel). Then PART 3 (device-selection persistence incl mic-not-persisting fix).
## Constraints
- Frontend only (+ tiny backend diag field only if needed for roomState/publishTriggerCount persistence). Do NOT touch the recorder.
- Build on EXISTING scaffolding (lobbySelfTestFlag/classifyMicCapture/micSilentWarning/speakerTest/missingJoinPrereqs/startLobbyPreflight/publishSfuOnceAfterAdmit) — extend, don't reinvent.
- Friendly Meet/Zoom UX, NO WebRTC jargon shown to users, mobile-friendly. Every gate/connecting state has a timeout + escape (never hangs).
- TESTS are mandatory (per DESIGN-SPEC "TESTS"): the never-publish cases reach 'audio-failed' not silent; gate blocks dead-mic/untested-speaker but not camera-off; config-panel device-switch re-validates; R8 persistence regression (select non-default mic -> reload/rejoin -> same mic in use). 
- Gate: `cd frontend && npx tsc --noEmit`=0, run touched specs via `npx tsx`, `npx ng build` green. Report exact commands+results in changes.md.
- NO git commit (projcore + red-team verify first).
## PROPOSED must include: your batch order, the exact files/functions you'll touch per part, the preflightGateStatus state design, how you confirm 'published'+real-audio, the config-panel component plan, the R8 persistence fix points, and which tests you'll add. WAIT for APPROVED-PLAN.
