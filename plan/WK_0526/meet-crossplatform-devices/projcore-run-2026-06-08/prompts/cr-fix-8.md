# CR-FIX-8 — Strip the clientKey credential from readable diagnostics (security; JROM-approved backend scope)
You are the IMPLEMENTER (codex). Verifier != fixer. SECURITY-SENSITIVE (auth/reconnect mechanism) — do NOT break admission or reconnect.
## FIRST tool call = callback: printf '[projcore callback] CR-FIX-8 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md ; plan → WAIT for APPROVED-PLAN → implement → DONE.
## THE ISSUE (CR9 codex55)
`clientKey` (the "unforgeable post-admission anchor" used to AUTHORIZE diagnostics POST + match reconnects) is persisted in the OWNER-READABLE diagnostics:
- Frontend embeds it in the payload: room.page.ts:3530 `clientKey: readClientKey()` (posted as the whole body, meeting-sessions.service.ts:470).
- Backend store.ts:288 extracts `participantClientKey = coerceIdentity(payload.clientKey)` into the `participant_client_key` COLUMN (needed for reconnect/admission matching — KEEP), AND store.ts:296 persists the WHOLE payload (incl clientKey) into `payload_json`.
- Read endpoints (store.ts:411,470 + sessions/index.ts) SELECT payload_json + participant_client_key → returned to the owner → credential exposed.
## REQUIRED FIX (preserve auth + reconnect; only remove the credential from READABLE surfaces)
1. **Backend store:** keep using `payload.clientKey` to populate the `participant_client_key` column (auth/reconnect matching stays intact), but STRIP `clientKey` from the payload object BEFORE serializing to `payload_json`. So stored diagnostics no longer contain the raw credential.
2. **Backend read:** ensure the diagnostics list/detail/download responses do NOT return the raw clientKey — i.e. do NOT include `participant_client_key` in the response objects (it's an internal matching column), and the stripped payload_json no longer has it. Redact, don't expose.
3. **Frontend (optional/clean):** the payload still needs clientKey for the POST to authorize, so KEEP sending it in the POST body; just ensure nothing in the READ path surfaces it. (If cleaner, move clientKey out of the persisted DiagnosticsPayload type into a transport-only field — but only if it doesn't break the backend's payload.clientKey auth read. Verify isAdmittedDiagnosticPoster still gets clientKey.)
## CONSTRAINTS / SAFETY
- MUST NOT break: diagnostics POST authorization (isAdmittedDiagnosticPoster, signaling/index.ts:507-537), reconnect/admission matching (participant_client_key), or existing diagnostics tests.
- Backend IS in scope for THIS fix (JROM-approved). Don't touch the recorder or the remote-audio fix.
- Run backend + frontend typecheck/tests: `cd backend && <tsc/test>` per project_specs + `cd frontend && npx tsc --noEmit`. Run the touched backend diagnostics tests.
- Add a test: stored payload_json contains NO clientKey; diagnostics read response contains NO clientKey/participant_client_key; admission/reconnect matching still works (participant_client_key column still populated).
- Append CR-FIX-8 to changes.md. NO commit.
Reply STATUS: PROPOSED + exactly where you strip clientKey (store) + how you exclude it from reads + proof admission/reconnect is preserved + the test. WAIT for APPROVED-PLAN.
