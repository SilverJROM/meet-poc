# CODE RED-TEAM — round CR10 — lens L10: security-fix completeness + recent-change re-sweep
# (Your role = the model you run as.) STREAK 0/3 — fresh lens.
## Context
CR9 found a clientKey credential in readable diagnostics; CR-fix-8 stripped it (backend) while preserving admission/reconnect. CR-fix-6/7 fixed the blocked-state machine + selectedSpeakerUnavailable reset. Verify these LATEST changes are complete + correct, AND that the security fix has NO residual hole or regression.
## READ the CURRENT files (frontend + backend/src/modules/sessions/* + signaling) + ../IMPL-prod-diff.patch.
## Your task — lens L10 (evidence file:line)
1. **clientKey strip completeness:** is the raw clientKey now absent from EVERY readable surface — payload_json (stored stripped), list/detail/download responses, the participant_client_key column not returned? Any OTHER place clientKey or another credential/token is logged, persisted-readable, or echoed (e.g. console logs, beacon path, error responses, the admin diagnostics endpoint)? Did stripping break admission auth (isAdmittedDiagnosticPoster) or reconnect matching (participant_client_key column populate + signaling match)? Confirm the relevant backend tests cover both.
2. **Recent-change correctness (CR-fix-6/7):** the unified blocked-state derivation (remoteAudioBlocked from remoteAudioBlockingReason) + selectedSpeakerUnavailable reset in BOTH cleanupCall + preflight — any contradiction, stuck state, or double-reset issue introduced?
3. **Regression from the backend change:** does the stripped payload still satisfy the diagnostics page (frontend reads no longer expect payload.clientKey)? Beacon vs fetch path both stripped? Migration/old-rows with clientKey still in payload_json — do reads of OLD rows leak it (the strip is store-time only)? If old rows leak, is that acceptable/needs a note?
4. Any NEW bug anywhere in the current diff.
## Output `<role>-coderedteam-CR10.md`:
```
# <role> CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)
## clientKey strip: complete everywhere? admission/reconnect intact? (file:line)
## CR-fix-6/7 correctness: OK or issue
## Regression / old-row leak / beacon path: OK or gap
## NEW bugs (table) or "none"
STATUS: CLEAN or STATUS: BUGS — <worst>
```
Honest CLEAN if clean.
