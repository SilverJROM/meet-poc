# Req Matrix — Recording reliability v2 + drop diagnosis (2026-06-25)

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|------------------------------|-------|----------|--------|
| R1 | Long call's recording reliably SAVED when host ends via close-room/leave | B1,B2 | B1-validate.md — host record→Close room→[rec] saved 03:59:49 on deployed env (deploy half). Long-call race = B2 grace-window (validating) + B5 capstone | VERIFIED (B5 capstone: real 4-min Peer2 call, ended via Close room → [rec] saved main 3.8MB + per-user incl peer2us; zero [rec] rejected) |
| R2 | Upload runs in background + persists across close to confirm completion | B2 | B2-validate.md — recording-pending.ts scans markers, queries /api/recordings, clears confirmed/keeps unconfirmed-on-error (covers interrupted-close); owner-gate intact | VERIFIED (pending B5 live capstone) |
| R3 | Upload rejection/failure no longer silent (log + host notice); owner-gate intact | B3 | B3-validate.md — 403/409/404/write-error each warn-logged with reason; owner-gate logic unchanged; host notice fires; backend tests assert log+status | VERIFIED |
| R4 | HRIS_TOJ mid-call drop diagnosed: client-internet vs app-caused, with proof | B4 | validation/drop-diagnosis.md — host SFU/ICE/WS connected throughout 03:12→03:23, kept receiving Joanne's audio+screen; no transport-recovery fired | VERIFIED (client-internet non-issue; caveat: remote diagnostics stopped 02:04 → diagnostics-hardening follow-up offered) |
| R5 | No regression: short recordings, AGENTROOM, international path still work | B5 | B5 capstone saved on real call; short smoke (B1V) saved; transcription clean (peer2us 543 words owner-labeled, 0 phantom-?, mixed file skipped) | VERIFIED |
