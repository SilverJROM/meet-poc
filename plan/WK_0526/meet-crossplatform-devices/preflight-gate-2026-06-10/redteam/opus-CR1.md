# opus RED-TEAM CR1 (lens L1: silent never-publish closure)

## Residual silent/never-publish paths: NONE found
Traced every exit of the publish flow; all route to a VISIBLE 'audio-failed' + config dialog:
- publishInitialSfuWithRetry: sets 'audio-connecting' (1611) on entry (after publishTriggerCount++); success -> 'ready' (1626); permanent failure -> 'audio-failed' (1645).
- Admitted handler guards: missing participantId/sessionId -> 'audio-failed' (1855/1862); fresh-join .catch -> 'audio-failed' (1847-1848 when in-call but still connecting); never silent.
- 30s BOUNDED timeout (startAudioConnectingTimeout 1576): if still 'audio-connecting' -> 'audio-failed' + notice + inCallDeviceDialogOpen. No infinite "Connecting…".
- retryPublishAudio (1559): guarded; missing session -> 'audio-failed'.

## in-call gated on 'published'? connecting bounded? empty-transceiver caught?
- YES: 'ready' is set ONLY on the successful-publish path (1626). UI surfaces "Connecting your audio…" (html:212-214) during audio-connecting. The user is always informed (connecting / failed), never silently-broken.
- Connecting bounded: 30s timeout -> audio-failed. (NON-CRITICAL nit: 30s is long to wait before the failure surfaces; consider ~12-15s.)
- Empty-transceiver: CAUGHT — initialPublishStream now THROWS InitialPublishPermanentError on no-live-track (1717) and no-live-media (1721), so the haiku "published with empty audio" path can't silently succeed.

## Observability
publishTriggerCount (508, reset cleanupCall) + preflightGateStatus + roomState are in the diagnostics payload (580/581) — the next failed join is fully diagnosable (count==0 => trigger never fired).

## Findings
- No [CRITICAL] residual silent-never-publish path under L1.
- [NON-CRITICAL] 30s connecting timeout is long (UX); confirm the call UI clearly reflects "audio not connected yet" beyond the notice banner (panel: check html control gating).

STATUS: CRITICAL-CLEAN — the silent never-publish bug is closed: every guard/catch/race/timeout routes to a visible audio-failed + config panel; connecting is bounded; empty-transceiver is caught; observability added. (Panel: verify the html doesn't present a fully-working call during 'audio-connecting'.)
