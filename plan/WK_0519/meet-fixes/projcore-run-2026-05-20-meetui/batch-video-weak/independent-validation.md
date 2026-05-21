# Batch video-weak Independent Validation

Requirement: DR-42, "Show video even on weak signal - audio still priority."

Validation result: PASS.

Evidence:
- Code review confirms sustained weak/poor quality now enters `autoDegradedReceivers` and sends `videoPaused: false, videoDegraded: true`.
- The remote sender applies degraded active video encoding: 120000 bps, scale 4, 8 fps.
- The audio-only floor is separate and conservative, requiring sustained poor samples plus critical audio-threatening conditions.
- Manual audio-only remains unchanged and authoritative.
- DR-13 audio priority remains high/high in sender preferences.
- Targeted e2e passed on isolated 48xx ports with `/tmp/meet-poc-video-weak.sqlite`.

5Q evidence gate:
- Q1 Scenario coverage: yes, weak/degraded, floor/audio-only, recovery, manual override, and DR-13 invariant covered.
- Q2 Proof at right level: yes, browser e2e asserts sender encodings and DOM video tile rendering.
- Q3 Screenshot accuracy: yes, degraded video, floor banner, manual audio-only, and quality pill screenshots captured.
- Q4 Scenario-to-test consistency: yes, scenarios and test report map to DR-42 acceptance.
- Q5 Requirement closure: yes, weak links no longer blank video before the true audio-protective floor.
