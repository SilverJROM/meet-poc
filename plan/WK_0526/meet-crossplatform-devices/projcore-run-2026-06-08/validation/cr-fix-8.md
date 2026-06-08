# CR-FIX-8 (clientKey security) — independent validation — 2026-06-08
VERDICT: PASS.
- store.ts:273 participantClientKey extracted; :274 {clientKey,...persistedPayload} strips it; :282 payload_json=JSON.stringify(persistedPayload) (stripped). Column still populated (288/313) → reconnect/auth intact.
- Read SELECTs (list 411 / detail 470) NO LONGER select participant_client_key → not returned to owner.
- Backend test: 13/13 PASS incl G-3 (rejects never-admitted clientKey = security preserved) + G-2 (durable reconnect) + the flipped G-1 (now asserts clientKey ABSENT). frontend tsc=0.
- Credential no longer in readable diagnostics; admission (isAdmittedDiagnosticPoster still reads body.clientKey pre-persist) + reconnect matching preserved.
