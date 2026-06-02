# B1 progress — in-call mic + camera always enable-able

## OG Spec: plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02/og-requirements.md (RC)
## Current: Phase 3, Batch B1
## Last action: qa test mode PASS (HARD gates green; 3/3 SOFT e2e vs real SFU); DEV deployed (pm2 meet-poc-fe #78)
## Next action: independent validator (Rule 11) → merge

### Batch B1: in-call mic AND camera always enable-able; never stiff
- Status: IN PROGRESS
- Branch: feat/incall-media-always-enableable-20260602
- Artifacts: scenarios ✓ | changes ✓ | review ✓ (APPROVE) | test-report ✓ (PASS) | screenshots ✓ (6) | independent-validation ✗

### Honest finding (qa): Bug A mic-acquire-from-absent is UNREACHABLE via current lobby UI
- Mic access is a join prerequisite (hasMicAccess) → guest always joins WITH an audio track → in-call mic is always a flip, never a dead no-op. Mic acquire path is defensive + unit-proven (S1.2) but not live-reachable through today's lobby gating.
- Camera (Bug B) defaults off / not a prereq → live-reachable; S4 e2e proves acquire-from-null-localStream + publish live (B outbound frames >0, sfuPublishState stays 'published').
- Selector drift noted: pre-join mic checkbox is name="microphoneRequested" (scenarios said micRequested); existing sfu-b5a-toggles test is itself stale on this.

### Plan (APPROVED)
- media.service.ts: toggleMic async + acquire (mirror replaceAudioTrack); toggleCamera no-stream branch
- room.page.ts: await toggleMic + publish via sfuClient.replaceAudioTrack; handleInCallMediaPermission → actionNotice hint
- NEW media-toggle.ts (resolveMediaToggleAction + permissionBlockHint) + media-toggle.spec.ts (tsx)
- e2e: join mic-off → enable → assert live audio track added+published (soft if fake-media harness can't)
