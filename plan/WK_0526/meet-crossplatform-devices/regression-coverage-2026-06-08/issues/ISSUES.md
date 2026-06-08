
## PHASE-C-H1-NULL-ENERGY-NO-RECOVERY H1 bytes-climbing null audio-energy stall is not actionable

The H1 replay fixture from session 11ee886f has climbing inbound bytes with flat emitted count and null audioLevel/totalAudioEnergy. Current decideVoiceRecovery returns no action because sampleWindowHasVoiceEnergy is false.

Observed failure: catalog expects bytes-climbing/no-energy inbound stall to enter recoverVoicePlayout path
+ actual - expected

+ 'none'
- 'resume'
## PHASE-C-H2-HIGH-CONCEALMENT-FALSE-SILENT H2 high concealment can classify emitting audio as silent

The H2 replay fixture from session 2579eb8f contains high concealedSamples while jitterBufferEmittedCount is positive. Current classifyRemoteAudioHealth can return silent solely from the concealment ratio.

Observed failure: catalog expects high concealment to be captured without falsely classifying emitting audio as broken
## PHASE-C-H12-ZERO-LEVEL-NO-RECOVERY H12 sustained inbound audioLevel=0 is not actionable

The H12 replay fixture from session 11ee886f has sustained inbound audioLevel=0. Current decideVoiceRecovery returns no action because emitted samples climb and totalAudioEnergy is null.

Observed failure: catalog expects sustained audioLevel=0 receiving window to use the stalled-verdict path
+ actual - expected

+ 'none'
- 'resume'
