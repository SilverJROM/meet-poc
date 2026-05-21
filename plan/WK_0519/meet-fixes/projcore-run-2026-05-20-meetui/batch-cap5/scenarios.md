# Batch cap5 Scenarios

1. DR-50 interim global cap: with the owner plus four admitted guests already in a room, a sixth participant is rejected through the existing room-full path with `room full (max 5)`.
2. DR-50 interim mobile cap: four mobile participants are allowed, but a fifth mobile participant is rejected with `mobile room full (4 max)` before the global room cap is reached.
3. DR-50 interim mobile protective video: on a mobile local device, room size four or higher defaults outbound video sender encoding to the existing DR-42 degraded tier while preserving local camera/video-on and DR-13 audio high priority.
4. DR-50 interim restore/layering: when room size drops below four, the mobile protective degrade condition clears; DR-42 weak-link degrade can still keep a peer degraded, and normal video encoding returns only when no protective or weak-link degrade condition remains.
