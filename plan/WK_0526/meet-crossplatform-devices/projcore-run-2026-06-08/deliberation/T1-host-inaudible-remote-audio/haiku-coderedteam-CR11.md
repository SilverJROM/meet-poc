# Haiku CODE red-team CR11 (lens L11: security closure + final sweep)

## clientKey/credential closure: complete (old+new, all paths)? admission intact? other exposed secret? (file:line)

**CLOSED.** clientKey redaction verified on both old and new rows across ALL read paths:

- **Store time (CR-fix-8):** store.ts:274 strips clientKey before storage (`{ clientKey: _clientKey, ...persistedPayload }`)
- **Read time (CR-fix-9):** store.ts:543 redacts clientKey from legacy rows via parsePayload (` const { clientKey: _clientKey, ...sanitized } = parsed`)
- **All read surfaces:**
  - Detail: GET `/api/meeting-sessions/:sessionId/diagnostics` → mapDiagnosticEntry → toDiagnosticEntry → parsePayload ✓
  - Download: GET `/api/meeting-sessions/:sessionId/diagnostics.json` → same redaction ✓
  - List: GET `/meeting-sessions/diagnostics-log` → no payload returned (session summaries only) ✓
  - POST response: returns mapDiagnosticEntry(entry) → redacted payload ✓
- **Admission/reconnect:** preserved. clientKey stored in separate participant_client_key column (store.ts:296-313) for identity/admission gates (signaling/index.ts:159-165). ✓
- **Other credentials:** None found. cfSessionId in sfuDiagnostics is a CF debug identifier, not a credential. No tokens, passwords, or apiKeys in payload. ✓

Tests confirm: session-diagnostics.test.ts:234 (legacy rows) + :584 (new rows via POST) both verify clientKey absence across detail, download, and stored payload.

## Whole-diff final sweep: any remaining bug (any class)? (file:line) or "none"

**NONE.** Diff is cohesive and tight:

1. **Backend redaction (store.ts:1–548):** clientKey stripped at store time (274), redacted at read time (543). Calls to parsePayload in toDiagnosticEntry (118) apply to all reads. No SELECT queries fetch participant_client_key column from diagnostics (410, 469 removed). Correct pattern.

2. **Frontend types (meeting-sessions.service.ts:377–418):** DiagnosticsPayload excludes clientKey (removed from 1207); DiagnosticsPostPayload adds it back for POST only (1225–1227). Type guards prevent accidental read-time exposure. Correct.

3. **Audio registry / voice recovery (remote-audio.service.ts + watchdog.spec.ts):** New audioLevel/totalAudioEnergy fields track voice presence. sampleWindowHasVoiceEnergy (CR-fix-2) and voiceRecoveryWindowExhaustedWhileStalled distinguish RTP/CN silence from actual voice, blocking false-positive recovery triggers. Tests verify negative/zero values ignored (CR-FIX-4). Voice stall state machine now latches correctly on window exhaustion (room.page.ts:2916–2934). No race in watchdog loop. Correct.

4. **Audio element lifecycle (tile.component.ts + room.page.html):** Removed per-tile remote audio elements (tile.ts:109–159 deleted). Centralized playback via RemoteAudioService.registry (service-managed, not template-managed). Eliminates autoplay-blocked race where individual tiles miss play() calls. applySpeakerDevice now returns SinkApplyResult enum (room.page.ts:840, 854) instead of boolean — distinguishes selected/default-fallback/unsupported/failed for UX feedback. Correct.

5. **Diagnostics UI (diagnostics.page.ts + spec.ts):** New remoteAudioPlayoutRows and callWideMediaPlayoutRow methods (lines 434–474) render per-publisher sink state, blocked reasons, and audio level. buildCallWideMediaPlayoutRow extracts mediaPlayout stats (SfuMediaPlayoutStats added to sfu-client.service.ts inboundTracks). Spec tests cover fallback distinction (line 369). No dropped fields. Correct.

6. **Integration:** room.page.ts:3550–3551 includes remoteAudioPlayout in buildDiagnosticsPayload. No late binding of diagnostics — captured inline before POST. Correct.

## R1/R2/R3 still hold after security changes?

**ALL HOLD:**

- **R1 (host hears all remote on selected device, never suppressed):** Yes. RemoteAudioService.applyOutputDevice (remote-audio.service.ts:131–150) applies setSinkId before play, and service.playoutDiagnostics captures per-publisher sink state and blockedReason. Diagnostics file:line 622–1629 shows R1 verified: both publishers audible on selected sink.

- **R2 (diagnostics localize):** Yes. Payload captures remoteAudioPlayout diagnostics (room.page.ts:3551), selectedAudioOutputId (3536), peers list with advertisedSubscribed (3558–3650). Security redaction doesn't alter what's captured — only what's returned. Backend appends clientKey to participant_client_key column (store.ts:296–313) *after* payload_json is persisted without it (282). Redaction in parsePayload (543) only touches read-time return values, not diagnostic collection.

- **R3 (unchanged after security changes):** Yes. The parsePayload redaction is a read-time projection, not a collection-time mutation. Backend doesn't modify what's captured into participant_client_key (it's written as-is from body.clientKey → appendDiagnosticsEntry line 273); only the payload_json omits it. Diagnostics still logs the full inbound stream (SfuDiagnosticsSnapshot.mediaPlayout included in line 3553, remotAudioPlayout in 3551). Zero impact on what debugger sees — only on what API client reads.

## NEW bugs (table) or "none"

**NONE.**

STATUS: CLEAN
