BATCH B03 — mic-first / camera-separate end-to-end + mobile constraints (P0.2: A4, D2, A11). PLAN HANDSHAKE FIRST.

Already done (B01+B02, committed): media.service.preflight + ALL acquire paths now use SEPARATE acquireAudio (must-succeed ladder) + acquireVideo (best-effort, returns null on failure) via the queue. So a combined audio+video getUserMedia no longer exists in the service layer; camera failure no longer throws there.

THIS BATCH — confirm + close the REMAINING P0.2 gaps:
1. A4: room.page.ts handleLobbyMediaError previously only retried audio-only on code==='denied'. Verify: with B01's best-effort camera in preflight, does a camera Overconstrained/NotFound/in-use error still ever reach handleLobbyMediaError and block audio? If any path can still fail audio due to a camera error, fix it (retry audio-only for ANY camera-side failure). If B01 fully prevents it, state that + add/keep a guard.
2. D2: confirm the JOIN/lobby first-acquisition (room.page.startLobbyPreflight → media.preflight) is now mic-first + camera-separate end-to-end (no combined request, camera denial never poisons mic). Confirm or fix any residual room.page combined-request.
3. A11: media.service videoConstraints uses mandatory max width/height on mobile ({ideal:854,max:854}/{ideal:480,max:480}) → can over-constrain some Android/external cams. Loosen to ideal-only (drop the mandatory max) so video isn't rejected; resolution can be tuned via sender params later.
PROPOSE (reply PROPOSED, WAIT): which of A4/D2 are already-covered (cite code) vs need a fix, the A11 constraint change, files, unit test if a pure decision exists, no-regression, complexity. Proof: unit (npx tsx) + ng build. 
FIRST append callbacks.md: [projcore callback] B03 PROPOSED <one-line>; on done [projcore callback] B03 DONE <one-line>.
