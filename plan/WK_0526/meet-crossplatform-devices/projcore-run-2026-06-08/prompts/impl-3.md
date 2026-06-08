# IMPL-3 — Remote-audio playout diagnostics (prove audio reached the speaker next call)

You are the IMPLEMENTER (codex). Verifier != fixer.
## FIRST tool call = callback: printf '[projcore callback] IMPL-3 STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md
Then plan → wait APPROVED-PLAN → implement → STATUS: DONE.

## Background (B16, from the deliberation)
Today's failing call could NOT be diagnosed because inbound audioLevel/totalAudioEnergy were null (Chrome 113+ moved them to the `media-playout` getStats type, which the collector doesn't read), and there was NO host playout-state capture. This batch makes the NEXT call definitively diagnosable: did received audio actually reach the selected speaker?

## SCOPE
1. `frontend/src/app/services/sfu-client.service.ts` collectDiagnostics (~L728-754 inbound loop): ALSO iterate `media-playout` stat type → capture `audioLevel`, `totalAudioEnergy`, `totalSamplesDuration`. Add `totalAudioEnergy` to inbound-rtp capture too. (Keep existing fields.)
2. `frontend/src/app/services/meeting-sessions.service.ts`: add a `RemoteAudioPlayoutDiagnostics` type: `{ selectedAudioOutputId: string|null, unlocked: boolean, blockedPeerIds: string[], perPublisher: { publisherClientId, trackId, paused, muted, volume, sinkId, srcObjectAttached, readyState }[] }` and a `mediaPlayout?: {audioLevel,totalAudioEnergy,totalSamplesDuration}` on the diagnostics snapshot/payload types.
3. `frontend/src/app/services/remote-audio.service.ts`: expose a `playoutDiagnostics()` method returning the per-publisher registry state above (it already tracks registry entries + el.paused/muted/sinkId/srcObject + unlocked + blockedPeerIds in debugSnapshot — extend/reuse).
4. `frontend/src/app/pages/room/room.page.ts` buildDiagnosticsPayload (~L3498-3525): include `remoteAudioPlayout: this.remoteAudio.playoutDiagnostics()` + selectedAudioOutputId alongside sfuDiagnostics.
5. `frontend/src/app/pages/diagnostics/diagnostics.page.ts(.html)`: render a per-publisher playout row (paused/muted/sinkId/energy) so JROM can read decode-vs-sink at a glance. Redact raw device IDs to a short hash or 'default'/'selected' label.

## Interpretation tuple to document in changes.md
"reached selected speaker" = mediaPlayout.totalAudioEnergy rising AND element.paused=false AND element.sinkId == selectedAudioOutputId. If energy rises but sinkId != selected → sink/device issue. If element exists but paused → autoplay/blocked. If no registry entry for a live publisher → wiring/subscribe issue.

## OUT OF SCOPE: the registry (IMPL-1) + mid-guard (IMPL-2) are done.
## Constraints: frontend only; backend stores payload_json as a TEXT blob (no schema change needed — confirm it accepts extra JSON fields). Don't touch recorder. tsc=0; run touched specs via npx tsx; append IMPL-3 to changes.md; NO commit.

Reply STATUS: PROPOSED + file-by-file + the exact type + where you source each field. Wait for APPROVED-PLAN.
