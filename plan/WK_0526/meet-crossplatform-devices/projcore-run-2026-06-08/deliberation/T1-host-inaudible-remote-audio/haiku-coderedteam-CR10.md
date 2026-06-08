# haiku CODE red-team CR10 (lens L10: security-fix completeness + recent-change re-sweep)

## clientKey strip: complete everywhere? admission/reconnect intact? (file:line)

**Backend storage (store.ts:273-274, 282)**:
- ✅ clientKey extracted early (line 273: `const participantClientKey = coerceIdentity(payload.clientKey)`)
- ✅ Payload stripped before storage (line 274: `const { clientKey: _clientKey, ...persistedPayload } = payload`)
- ✅ Stored as JSON-stripped (line 282: `payloadJson: JSON.stringify(persistedPayload)`)
- ✅ Column NOT returned to clients (lines 411, 470: SELECT statements omit `d.participant_client_key`)

**Admission & reconnect logic (signaling/index.ts:507-531)**:
- ✅ `isAdmittedDiagnosticPoster` validates using request body `poster.clientKey` (line 512)
- ✅ Durable identity check via `live.clientIdentities.get(poster.clientKey)` (line 518)
- ✅ Reconnect matching preserved: clientKey required to resume across disconnects (lines 524-530)
- ✅ Both live and reconnecting peers supported (lines 515-516)

**Frontend build & send (room.page.ts:3931, 3948)**:
- ✅ Payload still includes clientKey (line 3948: `clientKey: readClientKey()`)
- ✅ Sent in POST body for auth (still necessary, not returned in response)
- ✅ Beacon path uses same payload (line 3938: `sendDiagnosticsBeacon(sessionId, payload)`)

**Type safety (meeting-sessions.service.ts:417; sessions/store.ts:30-37)**:
- ✅ `DiagnosticsPayload` backend type has NO `clientKey` field (store.ts:30-37)
- ✅ `DiagnosticsPostPayload` frontend type HAS `clientKey` (meeting-sessions.service.ts:472 signature accepts it for POST)
- ✅ Returned `DiagnosticEntry.payload` is typed as `DiagnosticsPayload` (no clientKey in type)

**⚠️ CRITICAL: OLD-ROW LEAK**
- ❌ **Diagnostics stored BEFORE CR-fix-8** have raw `clientKey` in `payload_json`
- ❌ `getDiagnosticsForSession` / `getDiagnosticsEntry` call `parsePayload(row.payload_json)` (store.ts:540-545) with NO filtering
- ❌ `mapDiagnosticEntry` returns `payload: entry.payload` as-is (sessions/index.ts:47)
- ❌ GET `/meeting-sessions/:sessionId/diagnostics` returns these entries to owner (sessions/index.ts:line~125)
- ❌ GET `/meeting-sessions/:sessionId/diagnostics.json` download includes old clientKeys (sessions/index.ts:line~138)

**Blast radius**: Owner-only leak. Only room owner can see old participant clientKeys via diagnostics UI. **No public/participant access.** BUT: owner can export/screenshot these keys.

---

## CR-fix-6/7 correctness: OK or issue

**Blocked-state derivation (remote-audio.service.ts:648-654)**:
```typescript
function remoteAudioBlockingReason(entry): blockedReason {
  if (entry.sinkApplyTimedOut || entry.sinkApplyResult === 'failed') return 'sink-failed'
  if (entry.voiceStalled) return 'voice-stalled'
  if (entry.playbackFailure) return null  // suppress banner if known error
  if (entry.el.paused) return entry.blocked ? 'autoplay' : 'paused'
  return null
}
```
- ✅ Unifies all blocking paths (sink, voice, autoplay)
- ✅ Contradictions: None found. Priorities are clear: sink-failed > voice-stalled > autoplay > paused > null
- ✅ Does NOT double-trigger: voice stall and sink fail are independent entry states, ORed via `entries.some()`

**selectedSpeakerUnavailable reset (room.page.ts:2455, 2175)**:
- ✅ Reset in `cleanupCall` (line 2455, state transition out)
- ✅ Reset in `preflight` (line 2175, state transition in to lobby)
- ✅ Set based on `applyOutputDevice` result (lines 676, 1019, 2639)
- ✅ Tests exist: `shouldReconcileAudioOutputAfterRefresh` (room-decisions.spec.ts:68-80)

**No stuck-state paths found**: 
- Voice stall clears via `clearVoiceStalls` or energy recovery (room.page.ts:2827-2868)
- Sink failures reported in diagnostics but don't create latch without recovery
- Manual device switch always updates state

---

## Regression / old-row leak / beacon path: OK or gap

**Beacon path (room.page.ts:3938, 3948)**:
- ✅ Sends POST with full payload (including clientKey) for auth — necessary
- ✅ Browser's `navigator.sendBeacon` is fire-and-forget (no response body parsed by client)
- ✅ Server receives, validates clientKey, stores stripped payload
- ✅ No leak via beacon response

**Frontend diagnostics page (diagnostics.page.ts)**:
- ✅ No reference to `payload.clientKey` in template or component
- ✅ Does not display or log raw clientKey

**Admission/reconnect flow intact**:
- ✅ Durable clientKey identity survives reconnect (signaling/index.ts:518-530)
- ✅ Both fresh join and resume-by-clientKey paths work

**⚠️ OLD-ROW LEAK (REGRESSION from prior state)**:
- **Before CR-fix-8**: clientKey in stored JSON, returned to owner on GET
- **After CR-fix-8**: clientKey still in stored JSON (NOT migrated), still returned on GET
- **Impact**: No new leak, but old data not retroactively cleaned
- **Acceptable?** Only if scope is "new rows going forward" (which is what the patch does)

---

## NEW bugs (table) or "none"

| Finding | File:Line | Severity | Notes |
|---------|-----------|----------|-------|
| OLD diagnostic rows leak clientKey in payload_json to room owner via GET endpoints | backend/src/modules/sessions/store.ts:540-545, sessions/index.ts:47, GET /meeting-sessions/:sessionId/diagnostics | MEDIUM | Owner-only. Needs either (A) migration to strip old rows, (B) runtime filter in parsePayload or mapDiagnosticEntry, or (C) explicit acceptance that old data pre-strip is out of scope. |

---

STATUS: **BUGS** — Old-row clientKey leak. CR-fix-8 correctly strips NEW diagnostics and preserves admission/reconnect, but lacks retroactive cleanup or response-time filtering of old rows. CR-fix-6/7 blocked-state and selectedSpeakerUnavailable resets are correct.

**Recommendation**: Either add a migration `UPDATE meeting_session_diagnostics SET payload_json = JSON_REMOVE(payload_json, '$.clientKey')` for existing rows, OR filter in `mapDiagnosticEntry` like:
```typescript
function mapDiagnosticEntry(entry: DiagnosticEntry): Record<string, unknown> {
  const filtered = { ...entry.payload };
  delete filtered.clientKey;
  return { ..., payload: filtered };
}
```
