# CODE RED-TEAM — round CR5 — lens L5: adversarial inputs + browser/platform quirks + error paths
# (Your role = the model you run as.) STREAK 0/3 — CR4 found bugs; this is a FRESH lens (NOT structural/concurrency).
## Context
CR4 (concurrency/leak lens) found a HIGH selected-sink-fallback misreport + a map leak; CR-fix-3 fixed them (SinkApplyResult 'selected'|'default-fallback'|'failed' + selectedSpeakerUnavailable state + subscribeMidConflictWarnings cleared on teardown + watchdog-exhaustion keeps banner). This round attacks a DIFFERENT surface: GARBAGE INPUTS, BROWSER/PLATFORM QUIRKS, ERROR PATHS.
## READ the CURRENT files + ../IMPL-prod-diff.patch.
## Your task — lens L5 (evidence file:line)
1. **setSinkId-unsupported browsers** (iOS Safari, Firefox): canSetSinkId()/the `!withSink.setSinkId` path (remote-audio.service.ts ~135). On a browser with NO setSinkId, does the host still play to default WITHOUT crashing, with HONEST diagnostics (no false 'selected'), and no false selectedSpeakerUnavailable? Trace the whole sink path.
2. **Garbage / missing RTCStats**: bytesReceived / jitterBufferEmittedCount / audioLevel / totalAudioEnergy arriving as undefined, null, NaN, negative, 0, or huge. Trace remoteVoiceSample, remoteVoiceBytesClimbed, remoteVoiceEmittedClimbed, sampleWindowHasVoiceEnergy, decideVoiceRecovery, and the media-playout capture. Any crash, NaN-propagation, false stall verdict, or stuck/false banner from bad stats?
3. **Autoplay variants**: play() rejects with NotAllowedError vs AbortError vs NotSupportedError; partial user-activation; gesture during a pending addPublisher await. Does blocked vs error get the right banner, and does recovery actually replay?
4. **Weird device enumeration**: no output devices; selectedAudioOutputId is an empty string vs a stale id vs a duplicate; device list changes mid-call (devicechange storm). Sane behavior?
5. **Degenerate streams**: MediaStream with 0 audio tracks; track.readyState 'ended' at addPublisher time; srcObject set to an already-ended stream. Any orphan element or stuck state?
6. **Diagnostics payload robustness**: old rows missing the new fields (effectiveSinkId/usedFallback/perPublisher) — does the diagnostics page render without throwing? Any unguarded access?
7. Anything prior lenses + the coordinator missed.
## Output `<role>-coderedteam-CR5.md`:
```
# <role> CODE red-team CR5 (lens L5: adversarial inputs / browser quirks / error paths)
## Findings by probe (1-7): each OK or bug (file:line)
## NEW bugs (table severity|file:line|what|fix) or "none"
STATUS: CLEAN — no real bug under this lens   OR   STATUS: BUGS — <worst>
```
Genuinely feed it garbage. Different lens than CR1-4. Honest CLEAN if clean.
