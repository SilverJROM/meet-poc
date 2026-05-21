# Batch cap5 Independent Validation

PASS.

Evidence:
- Source review confirms `MAX_ADMITTED = 5` and `MAX_MOBILE_ADMITTED = 4`.
- Source review confirms non-owner direct joins at five total admitted/reconnecting participants return `room full (max 5)` before any mobile sub-cap message.
- Source review confirms owner/resume admission paths remain exempt from the non-owner cap checks.
- Frontend review confirms mobile-protective video is a sender degrade condition at total room size `>= 4`, not an audio-only default or camera-off toggle.
- Frontend review confirms the degrade condition restores automatically when the peer list drops below four because `removePeer()` recomputes all video policies.
- Frontend review confirms DR-42 weak-link degrade and DR-50 mobile-protective degrade layer through a single OR condition, so whichever asks for degradation wins without double-applying encoding limits.
- Backend targeted tests passed, full build passed, and live pm2 deploy verification passed with no test env leak.

Requirement closure:
- DR-50 interim is satisfied for the approved full-mesh cap=5 approach.
- SFU/Cloudflare Realtime remains deferred and was not implemented.
