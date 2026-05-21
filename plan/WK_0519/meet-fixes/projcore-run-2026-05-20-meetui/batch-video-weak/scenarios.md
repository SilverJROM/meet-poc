# Batch video-weak Scenarios

## DR-42: weak link keeps video visible first

- Given two admitted peers with camera enabled
- When the receiver observes sustained poor/weak quality samples that are not at the critical audio floor
- Then the receiver requests degraded remote video instead of audio-only
- And the remote sender keeps video active with audio priority high
- And the receiver still renders the remote video tile

## DR-42: critical floor still protects audio

- Given a peer is already degraded or has sustained critical quality samples
- When the link reaches the conservative floor condition where video can threaten audio
- Then the receiver sends the existing audio-only auto-poor policy
- And the remote video sender pauses while the audio sender remains active/high priority

## DR-42: recovery and manual audio-only

- Given auto-degraded or auto-floor state was entered
- When AUTO_RESTORE_GOOD_SAMPLES good samples arrive
- Then automatic state clears and video returns to normal encoding
- But if manual audio-only is enabled, manual pause stays authoritative and is not overridden.
