# Plan review — SFU cutover (codex as independent reviewer)

You are the INDEPENDENT REVIEWER of an implementation plan (you will later validate each task; a Sonnet Claude implements). Do NOT implement anything now — review only.

## Read
- `plan/WK_0519/sfu-cutover/og-requirements.md` (SR-1..10)
- `plan/WK_0519/sfu-cutover/implementation-plan.md` (B1..10 + per-task loop)
- For grounding: `frontend/src/app/services/webrtc.service.ts` (current full-mesh impl), `backend/src/modules/signaling/index.ts` (ws signaling), `backend/src/modules/ice-config/index.ts` (TURN), `.env` has SFU_APP_ID/SFU_TOKEN.

## Context
Full cutover from full-mesh WebRTC to Cloudflare Realtime SFU (the SFU media server, base `https://rtc.live.cloudflare.com/v1/apps/{APP_ID}`; sessions/tracks/renegotiate API; App Secret server-side only; CF does no presence so our ws signaling carries each participant's CF sessionId + trackNames). The mesh hardening DR-1..56 was just completed; cutover retires the mesh-only parts and keeps admit/identity/reconnect/chat/host/diagnostics/device-recovery/iOS-audio.

## Review questions (answer each)
1. **API correctness:** Is the Cloudflare Realtime model + endpoints + the publish(local)/subscribe(remote)/renegotiate flow stated correctly? Any endpoint, field, or flow detail wrong or missing (e.g. DataChannel, track naming/uniqueness, who answers on subscribe, session/track limits, the renegotiate offer direction)?
2. **Decomposition + order:** Are B1-B10 truly atomic vertical slices (<30min-ish, ~1-3 tests, tight diff), correctly dependency-ordered? Anything that should split or merge or reorder?
3. **Missing requirements/risks:** What's missing? Consider: ICE config for the client↔CF leg (do we still pass our TURN, or does CF provide ICE?), track-name scheme, renegotiation races (publish + subscribe concurrent), simulcast support on CF SFU + how layer selection actually works, handling participants >previous cap, screenshare as a separate track vs replacing camera, audio-only iOS, security/authz on /api/sfu/*, CF egress cost.
4. **Mesh teardown (B8) risk:** Anything in the "retire mesh" list that is risky to remove or actually still needed under SFU (e.g. is DR-40 ICE-restart still relevant for the single client↔CF PC? is TURN still needed as ICE?). Flag mis-categorizations.
5. **Mapping existing features:** Do admit/waiting-room/identity/reconnect (DR-37/38/39), chat, host controls, diagnostics map cleanly onto the SFU topology as planned? Any conflict?

## Output
Write findings to `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/plan-review-codex.md` — a concise per-question verdict with concrete corrections, and a prioritized list of plan changes (MUST-FIX vs NICE-TO-HAVE). End with `STATUS: REVIEW-DONE — <one-line overall verdict>`. Do NOT edit the plan files or any source; review only.
