# sonnet CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)

## clientKey strip: complete everywhere? admission/reconnect intact? (file:line)

**Store-time strip: ✅**
`backend/src/modules/sessions/store.ts:273-274` — destructures `clientKey` into `_clientKey` before `JSON.stringify(persistedPayload)`. New rows are stored clean.

**participant_client_key column: ✅ (auth-only, not returned)**
Column still populated at `store.ts:288` for `isAdmittedDiagnosticPoster` reconnect matching. Both SELECT queries at `store.ts:411` (getDiagnosticsForSession) and `store.ts:470` (getDiagnosticsEntry) now omit `d.participant_client_key`. The `DiagnosticEntryRow` type and `toDiagnosticEntry` mapper do not carry the field. `mapDiagnosticEntry` (`sessions/index.ts:56-71`) returns `participantId`, `participantName`, `payload` — no `participantClientKey`.

**LIST / DETAIL / DOWNLOAD responses: ✅**
All three routes go through `mapDiagnosticEntry(toDiagnosticEntry(row))`. Column excluded from SELECT, excluded from mapper. Clean for new rows.

**Beacon path: ✅**
`sendDiagnosticsBeacon` (`meeting-sessions.service.ts:1231`) and `appendDiagnostics` post to the same endpoint. Strip happens in `appendDiagnosticsEntry` regardless of transport.

**SFU endpoint: ✅**
`realtime-sfu/index.ts:73` — `const { clientKey: _ck, ...rest } = body` strips key before forwarding to CF. Not echoed in any response. Error messages are generic strings.

**Signaling echo: ✅ (not echoed to clients)**
`clientKey` appears in three internal in-memory maps: `live.reconnectTickets` (line 311), `live.reconnecting` (line 561), peer `entry` (line 951). None of these objects are serialized into outgoing WebSocket messages. `send(entry.ws, { type: 'reconnect-token', token, expiresAt })` (line 318), `send(peer.ws, { type: 'peer-reconnecting', ... })` (line 575), and `admitted` messages all omit `clientKey`.

**Admission auth integrity: ✅**
`isAdmittedDiagnosticPoster` (`signaling/index.ts:497-523`) checks live in-memory `admitted` / `reconnecting` maps and `clientIdentities` — all memory structures untouched by the DB SELECT change. Reconnect grace path (G-1 test) still passes.

**Console logs / admin endpoints: ✅**
No `console.log` of clientKey in the sessions or SFU routes. No admin bypass endpoint exists; all diagnostics read-paths require owner auth.

**⚠️ OLD-ROW LEAK (store-time-only strip — known gap)**
Old rows written before the fix still contain `clientKey` in `payload_json`. `parsePayload` (`store.ts:539-546`) returns raw JSON; `mapDiagnosticEntry` returns `payload: entry.payload`. Reading pre-fix rows returns their `clientKey` in the API response `payload` field.

*Scope:* Owner-only gate (`sessions/index.ts:129-141`) — only the session owner can read their own old diagnostics. No cross-user exposure. The owner already holds their own key (`readClientKey()` generates it client-side). Acceptable residual; a migration to strip existing `payload_json` rows would close it cleanly but is not a regression introduced by this fix.

---

## CR-fix-6/7 correctness: OK with one new bug

**CR-fix-6 (unified blocked-state derivation): ✅**
`room.page.ts` effect: `this.remoteAudioBlocked.set(this.remoteAudio.remoteAudioBlocked())` — derives the banner signal directly from the service's authoritative `remoteAudioBlocked` signal, which is set by `refreshBlockedState()` on every entry state change. No contradiction or stuck state.

`remoteAudioBlockingReason` returning `'paused'` for an entry where `entry.blocked = false` and `el.paused = true` is transient (requires `el.play()` success followed immediately by a browser-initiated pause before the `onPaused` event fires). The keepalive `recoverPlayback` loop self-resolves this. Not a stuck state.

**CR-fix-7 (`selectedSpeakerUnavailable` reset): ✅ correct sites, one bug in effect**

Reset in cleanup/reset block (`room.page.ts:2781`): ✅
Reset in initial-publish setup (`room.page.ts:2811`): ✅
Both cover the "leaving call" and "re-entering call" paths; no stuck banner across call sessions.

**⚠️ BUG: `selectedSpeakerUnavailable` clearing race on `result === 'failed'`**

In `changeAudioOutputDevice` (`room.page.ts:1012-1027`), when `result === 'failed'`:
1. `selectedAudioOutputId.set(deviceId)` — triggers the `selectedAudioOutputId` effect
2. `await this.applySpeakerDevice('')` — routes to default (also likely fails if step 1 failed hard)
3. `this.selectedSpeakerUnavailable.set(!!deviceId)` — correctly sets banner

Then the effect fires (setTimeout-deferred), re-applies `applySpeakerDevice(deviceId)` → `'failed'` → effect handler: `this.selectedSpeakerUnavailable.set(result === 'default-fallback')` = `set(false)` — **clears the in-call device-notice banner**.

The `'failed'` case (both specific device AND default fallback fail) is not handled in the effect's `selectedSpeakerUnavailable` write. Compare with the `devicechange` handler at `room.page.ts:2820` which correctly uses `result === 'default-fallback' || result === 'failed'`.

*Severity:* LOW — `'failed'` requires both the specific device AND the OS default to reject `setSinkId`, which is rare. The `deviceDialogError` error message is still set by both `changeAudioOutputDevice` and the effect, so the user sees the dialog error. Only the persistent in-call device-notice banner is incorrectly cleared.

*Fix:* In the `selectedAudioOutputId` effect handler, change:
```ts
this.selectedSpeakerUnavailable.set(result === 'default-fallback');
```
to:
```ts
this.selectedSpeakerUnavailable.set(result === 'default-fallback' || result === 'failed');
```

---

## Regression / old-row leak / beacon path: OK with known gap

**Frontend reads no longer expect `payload.clientKey`: ✅**
`DiagnosticsPayload` (frontend, `meeting-sessions.service.ts:391`) no longer has `clientKey`. The diagnostics page reads `entry.payload.remoteAudioPlayout`, `entry.payload.sfuDiagnostics`, etc. — no `clientKey` dependency introduced. `DiagnosticsPostPayload` = `DiagnosticsPayload & { clientKey: string }` is outgoing-only.

**Beacon path stripped: ✅** (same endpoint, same strip — confirmed above)

**Old rows: ⚠️** (detailed above — owner-only gate, acceptable residual)

---

## NEW bugs

| # | File:line | Severity | Description |
|---|-----------|----------|-------------|
| 1 | `frontend/src/app/pages/room/room.page.ts` — `selectedAudioOutputId` effect handler | LOW | Effect sets `selectedSpeakerUnavailable.set(result === 'default-fallback')` which evaluates to `false` when `result === 'failed'`, clearing the in-call device-notice banner that `changeAudioOutputDevice` just raised for a hard-fail. Fix: `set(result === 'default-fallback' \|\| result === 'failed')`. The error dialog message still shows; only the banner flickers off. |

---

STATUS: BUGS — LOW (selectedSpeakerUnavailable clearing race on 'failed' sink result); security fix strip is complete and admission/reconnect is intact; old rows are an acceptable owner-only residual gap not introduced by this change.
