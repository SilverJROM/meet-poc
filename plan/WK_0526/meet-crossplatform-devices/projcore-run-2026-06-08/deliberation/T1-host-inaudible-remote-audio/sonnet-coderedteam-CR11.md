# sonnet CODE red-team CR11 (lens L11: security closure + final sweep)

## clientKey/credential closure: complete (old+new, all paths)? admission intact? other exposed secret?

**New rows — store-time strip: COMPLETE**
`appendDiagnosticsEntry` (store.ts:273-274) destructures `clientKey` out before serialization:
```ts
const participantClientKey = coerceIdentity(payload.clientKey);
const { clientKey: _clientKey, ...persistedPayload } = payload;
// payloadJson: JSON.stringify(persistedPayload)  ← clientKey absent
```
clientKey lands only in the `participant_client_key` column, never in `payload_json`.

**Old rows — read-time redaction: COMPLETE**
`parsePayload` (store.ts:539-547) strips `clientKey` from any stored JSON regardless of age:
```ts
const { clientKey: _clientKey, ...sanitized } = parsed as DiagnosticsPayload;
return sanitized;
```

**`participant_client_key` column never returned: CONFIRMED**
Both SELECT queries that feed `toDiagnosticEntry` do NOT include `participant_client_key`:
- `getDiagnosticsForSession` (store.ts:411): `…d.participant_id, d.participant_name` — stops there.
- `getDiagnosticsEntry` (store.ts:470): same column list.
`DiagnosticEntryRow` type also dropped the field (patch: `-  participant_client_key: string | null;`). Type and SQL are in sync.

**All read surfaces covered (file:line):**
- `GET /meeting-sessions/:sessionId/diagnostics` → `getDiagnosticsForSession` → `toDiagnosticEntry` → `parsePayload` → `mapDiagnosticEntry` (index.ts:56-71, no `participantClientKey` field) ✓
- `GET /meeting-sessions/:sessionId/diagnostics.json` (index.ts:143) → identical path ✓
- `POST /meeting-sessions/:sessionId/diagnostics` response (index.ts:170) → `getDiagnosticsEntry` → `toDiagnosticEntry` → `parsePayload` → `mapDiagnosticEntry` ✓
- `GET /meeting-sessions/diagnostics-log` (index.ts:115) → `mapDiagnosticSummary` → never touches `payload_json` ✓
- `GET /admin/*` (admin/index.ts) → no diagnostics payload returned; user-list and settings only ✓
- No export endpoints. No error bodies that include payload_json.

**Admission/reconnect intact: YES**
index.ts:163 still reads `body.clientKey` for `isAdmittedDiagnosticPoster` gate before calling `appendDiagnosticsEntry`. The strip happens inside the store function, downstream of the gate. signaling/index.ts admission logic and SFU realtime-sfu/index.ts clientKey-based session lookup are unaffected (separate subsystems).

**Other credentials in payload:**
`cfSessionId` is NOT part of `DiagnosticsPayload` or `DiagnosticsPostPayload` types and is not emitted by `buildDiagnosticsPayload` (room.page.ts:3510-3544). No reconnect tokens, session cookies, or password fields appear in the diagnostics type tree. `DiagnosticsPostPayload` = `DiagnosticsPayload & { clientKey: string }` — the only addition is `clientKey`, and the type system enforces this boundary. **No other exposed credential found.**

---

## Whole-diff final sweep: any remaining bug (any class)?

Examined: store.ts (backend), sessions/index.ts, admin/index.ts, remote-audio.service.ts, room.page.ts, room-decisions.ts, diagnostics.page.ts, meeting-sessions.service.ts, tile.component.ts/html, controls-bar.component.ts/html.

**No bugs found.** Specific checks:

- **`combineSinkApplyResults` (remote-audio.service.ts:675-680):** Severity ordering `failed > default-fallback > unsupported > selected` is correct. Empty array returns `'selected'` (correct when no elements to route).

- **`sampleWindowHasVoiceEnergy` (remote-audio.service.ts):** Samples without `audioLevel`/`totalAudioEnergy` fields (e.g., structural old values from prior session code) return `false`, suppressing false recoveries on CN/silence streams. Correct. Negative values guarded by `>= 0` check. Tests cover this (negative-energy fixture → false).

- **`voiceRecoveryWindowExhaustedWhileStalled`:** Guards on `sampleUsable` (remote-audio.service.ts:682 — defined, checks `bytes >= 0 && emitted >= 0`), so negative-stat garbage from line 3791 in `remoteVoiceSample` guard (`if (bytes < 0 || emitted < 0) return null`) cannot reach the stall latch. Layered defence holds.

- **`applySpeakerDevice` selector (room.page.ts:2659):** `audio:not([data-remote-audio])` correctly excludes registry-owned elements (which set `dataset['remoteAudio'] = clientId`, confirmed by test at remote-audio.service.spec.ts:1933). No accidental double-routing.

- **`changeAudioOutputDevice` on `'failed'` path:** Stores the broken `deviceId` in localStorage and keeps `selectedAudioOutputId` set to it — intentional design (enables recovery on next devicechange or page reload). `selectedSpeakerUnavailable` banner is shown. Not a bug.

- **`shortHash` (diagnostics.page.ts:502-509):** FNV-1 variant (XOR-then-multiply, not standard FNV-1a which multiplies first). For a non-crypto display hash this is acceptable. Produces a stable 6-hex label. No collision risk at this use scale.

- **`selectedSpeakerUnavailable.set(false)` reset sites:** Set to false in both `joinCall` (room.page.ts:2792) and `rejoin` (room.page.ts:2452) paths. Clean on call teardown. No stale-banner leak between calls.

- **Registry stale-write guard:** `applyOutputDevice` checks `this.generation !== generation` before updating `selectedSinkId`/`effectiveSinkId`/`usedFallback` state after a concurrent reset. Covered by test CR-FIX-6 (sink apply resolves after reset). CLEAN.

- **`DiagnosticsPayload` type no longer has `clientKey`:** Enforced at compile time. `buildDiagnosticsPayload` returns `DiagnosticsPostPayload` which adds `clientKey` only for the wire POST. The read type (`DiagnosticEntry.payload: DiagnosticsPayload`) cannot carry `clientKey`. Correct separation.

---

## R1/R2/R3 still hold after security changes?

**R1 (host hears all remote on selected device): HOLDS**
The backend security changes (store-time strip + read-time redaction) touch only what is persisted in `payload_json` and returned in API responses. The audio playout path — `RemoteAudioService` registry, per-publisher elements, `applyOutputDevice`, `unlockAndPlayRemoteSinks` — is entirely local frontend state, not driven from stored diagnostics. The `remoteAudioPlayout` field captured in `buildDiagnosticsPayload` is a snapshot read from `this.remoteAudio.playoutDiagnostics()`; it is unaffected by what the backend later strips on read.

**R2 (never suppressed): HOLDS**
No suppression or muting logic was introduced or altered by the security changes. `setMutedAll` behavior is unchanged. The volume cap at `MAX_VOLUME = 1` removes the old >100% amplification (controls-bar and remote-audio.service changes) — not a suppression. Elements play at user-set volume ≤ 100%.

**R3 (diagnostics localize): HOLDS**
`parsePayload` strips `clientKey` only — all other fields (`remoteAudioPlayout`, `sfuDiagnostics`, `peers`, network path data) pass through intact. `diagnostics.page.ts` reads `entry.payload.remoteAudioPlayout` and `entry.payload.sfuDiagnostics` for the new playout rows; these fields survive the redaction. Diagnostics capture is not altered; only the `clientKey` credential is withheld from read responses.

---

## NEW bugs (table)

| # | File | Line | Class | Description |
|---|------|------|-------|-------------|
| — | — | — | — | none |

---

STATUS: CLEAN
