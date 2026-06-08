# CR-FIX-9 — independent validation — 2026-06-08
VERDICT: PASS. clientKey thread CLOSED.
- parsePayload (store.ts) destructures {clientKey,...sanitized} on READ → old + new rows sanitized on list/detail/download. Store-time strip retained.
- room.page.ts:676 now 'default-fallback' || 'failed' → 'failed' marks unavailable (sonnet LOW fixed; matches 2639).
- Backend 14/14 pass (incl new legacy-row test asserting clientKey absent + G-2/G-3 reconnect/security). frontend tsc 0.
- Admission/reconnect untouched (participant_client_key column kept server-side, not in responses).
