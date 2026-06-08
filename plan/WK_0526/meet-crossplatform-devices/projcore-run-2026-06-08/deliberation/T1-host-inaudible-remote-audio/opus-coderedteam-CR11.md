# opus CODE red-team CR11 (lens L11: security closure + final sweep)

## clientKey/credential closure: COMPLETE
- Read-time redaction is a SINGLE CHOKEPOINT: `parsePayload` has exactly ONE caller — `payload: parsePayload(row.payload_json)` (store.ts:118) — through which list, detail, AND download.json all map. `parsePayload` now destructures `{ clientKey: _clientKey, ...sanitized }` → every read path is sanitized for BOTH old and new rows. Cannot be bypassed (no other payload read path).
- Store-time strip retained (CR-fix-8); participant_client_key column populated server-side but removed from read SELECTs; admission (isAdmittedDiagnosticPoster reads body.clientKey pre-persist) + reconnect matching intact; backend 14/14 incl legacy-row + G-2/G-3.
- Admin module returns NO diagnostics payload (kill-switch flag only). No console.log of clientKey (warns log publisherClientId/cfSessionId only).
- **Other secrets check:** cfSessionId is exposed in sfuDiagnostics but is a CF Calls session IDENTIFIER, not a credential — acting on a CF session requires the app backend's CF auth/secret (not in payload). selectedAudioDeviceId/sinkId/trackId are owner-scoped device/track ids (acceptable per contract, CR9). No other auth anchor/token in the payload. So clientKey was the only credential; it's closed.

## Whole-diff final sweep
Fresh pass over the complete diff (registry playout + sink-before-play + watchdog/voiceStalled + unified blocked-derivation + diagnostics + backend redaction): no remaining bug found. The state machine is single-source (remoteAudioBlocked from remoteAudioBlockingReason); sink/blocked self-clear on success with isEntryCurrent guards; reset hygiene complete; mid-guard reclaim-safe + reneg; no leaks/races beyond the already-fixed set. tsc 0 (FE) + backend 14/14 + ng build green (last verified).

## R1/R2/R3 still hold
YES — the backend redaction changes only what diagnostics RETURN on read (clientKey omitted), NOT what is CAPTURED. R1 (host hears all on selected device), R2 (all concurrent, no suppression), R3 (per-publisher decode/sink/blocked-reason diagnostics) are unaffected and intact.

## NEW bugs
None.

STATUS: CLEAN — clientKey credential thread fully closed (single parsePayload chokepoint redacts all read paths for old+new; no other exposed credential; admission/reconnect intact); whole-diff final sweep clean; R1/R2/R3 hold. Vote toward streak 1/3 (lens L11).
