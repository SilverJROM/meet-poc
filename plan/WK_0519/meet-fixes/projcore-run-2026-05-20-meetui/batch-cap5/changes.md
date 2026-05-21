# Batch cap5 Changes

User Report verbatim:
> JROM decided: stay full-mesh, HARD-CAP participants at 5 (SFU deferred -- he'll look into Cloudflare Realtime later). Two parts: (1) backend MAX_ADMITTED -> 5 (currently 8 at signaling/index.ts ~102-103); 6th knock hits existing room-full path; owner always admitted; update signaling-room-full + signaling-mobile-cap tests to cap=5; mobile cap stays <=5 (propose). (2) Mobile/weak-protective video: at room >=~4, a mobile peer defaults its OUTBOUND video to the DR-42 degraded tier (or audio-only) to protect audio+device -- reuse DR-42 degrade + DR-13 audio-priority; manual video-on still works; audio always priority.

Root Cause mechanism:
The prototype was still configured for an eight-participant mesh room. That allowed too many full-mesh WebRTC peer connections for the interim no-SFU design, and mobile peers had no proactive sender-side protection when the room reached the higher-count zone where outbound video fanout strains device and audio stability.

Per-file WHY:
- `backend/src/modules/signaling/index.ts`: changed `MAX_ADMITTED` to 5, kept `MAX_MOBILE_ADMITTED` at 4, and made room-full/mobile-full messages derive from the constants. The direct join path checks global room-full before mobile-full so a true sixth participant receives the canonical room-full UX.
- `backend/tests/signaling-room-full.test.ts`: updated S2.11 to admit owner plus four guests and assert the sixth participant gets `room full (max 5)`.
- `backend/tests/signaling-mobile-cap.test.ts`: kept the mobile sub-cap at four, covered fifth-mobile rejection before the global cap, and covered global cap rejection at five total participants.
- `frontend/src/app/services/webrtc.service.ts`: added a local mobile protective degrade condition at four total participants. It feeds the existing DR-42 sender preference path, restores when room size drops below four, and composes with DR-42 weak-link degrade by using a single "degrade if any condition requires it" decision.
- `frontend/src/app/pages/room/room.page.ts`: passes the current mobile viewport state into `WebrtcService.configure()` so the sender policy only applies to mobile local peers.

Autonomous decisions: none. The cap, mobile sub-cap, threshold, auto-degrade choice, restore behavior, and DR-42/DR-13 composition were operator-approved before implementation.

Caveats:
- No SFU work was included; this is DR-50 interim full-mesh only.
- Frontend has no existing unit test harness for `WebrtcService`; the mobile video policy was build-validated and reviewed at the service mechanism level.
