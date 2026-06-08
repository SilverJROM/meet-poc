# opus CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)

## clientKey strip: mostly complete, ONE residual
- NEW writes: payload_json = JSON.stringify(persistedPayload) with clientKey spread-omitted (store.ts:274,282). ✓
- Read SELECTs (list 411 / detail 470): participant_client_key removed from the projection → not returned. ✓
- Admission/reconnect: participant_client_key column still populated (288/313); isAdmittedDiagnosticPoster still reads body.clientKey pre-persist; backend tests 13/13 pass incl G-3 (rejects never-admitted) + G-2 (durable reconnect). ✓
- Admin endpoint (admin/index.ts) is the diagnostics kill-switch flag only — returns NO payloads. ✓
- Beacon path posts to the SAME endpoint → stripped on store. ✓
- **RESIDUAL (real): OLD rows leak clientKey on read.** The strip is STORE-TIME only. `parsePayload` (store.ts:539) does `JSON.parse(value)` and returns the object AS-IS — no read-time strip. Any diagnostics row written BEFORE CR-fix-8 still has clientKey in payload_json and is returned raw on list/detail/download. No migration cleans existing rows.
  **FIX:** redact clientKey at READ — in parsePayload (or the row->entry mapper), delete `clientKey` from the parsed payload before returning. This is defense-in-depth covering BOTH old and new rows regardless of when written (and makes the store-time strip belt-and-suspenders). Optionally also a one-time migration UPDATE to scrub existing payload_json, but read-time redaction is sufficient and robust.

## CR-fix-6/7 correctness
OK. remoteAudioBlocked derived from remoteAudioBlockingReason (single source, can't disagree); selectedSpeakerUnavailable reset in BOTH cleanupCall + preflight (idempotent set(false), no double-reset issue). No contradiction/stuck state.

## Regression / beacon / old-row
- Frontend diagnostics page does not read payload.clientKey (display path uses other fields) → stripping doesn't break the UI. ✓
- Old-row leak = the residual above.

## NEW bugs
| severity | file:line | what | fix |
|---|---|---|---|
| MED (security completeness) | backend/src/modules/sessions/store.ts:539 (parsePayload) + 118 mapping | Store-time clientKey strip doesn't cover rows written before CR-fix-8 → old rows return clientKey on read. | Redact clientKey at READ in parsePayload/mapper (covers old+new); optional migration to scrub existing payload_json. |

STATUS: BUGS — clientKey strip is correct for new writes + reads, admission/reconnect intact, but OLD rows still leak it on read because the strip is store-time only and parsePayload doesn't redact. Add read-time redaction (CR-fix-9). Everything else (CR-fix-6/7) CLEAN.
