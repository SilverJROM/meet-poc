Batch B6a — Publisher simulcast (SR-6 part 1)

You are the IMPLEMENTER (Sonnet), supervised by Claude /projcore (lkvc-38); codex validates. Branch `feat/sfu-cutover`. One atomic task, surgical. Context just cleared — re-read.

## Read first
- `plan/WK_0519/sfu-cutover/og-requirements.md` — SR-6 + "Key design constraints" (simulcast fields: `preferredRid`, `priorityOrdering`, `ridNotAvailable`; verify selected layer via stats/API).
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/context-handoff.md` — B0-B5b state (doPublish, videoSender, /api/sfu/tracks publish flow).
- `frontend/src/app/services/sfu-client.service.ts` — doPublish (where the video transceiver is added with sendEncodings), the publish round-trip.
- Cloudflare Realtime simulcast docs behavior (you researched the API; RID-based simulcast: publisher sends multiple encodings with rid + scaleResolutionDownBy; the SFU forwards layers).

## Task (SR-6 part 1) — publish camera video as RID simulcast
Make the CAMERA video published with multiple simulcast layers so the SFU can forward a per-receiver-appropriate quality (B6b does the subscriber-side selection).
1. In `doPublish`, add the camera video transceiver/sender with **`sendEncodings`** describing multiple RID layers, e.g. high/medium/low: `[{ rid: 'h', scaleResolutionDownBy: 1, maxBitrate: ~1_200_000 }, { rid: 'm', scaleResolutionDownBy: 2, maxBitrate: ~400_000 }, { rid: 'l', scaleResolutionDownBy: 4, maxBitrate: ~120_000 }]` (tune values reasonably). Order/values per WebRTC simulcast norms.
2. Ensure the publish offer SDP carries the simulcast RIDs (a~simulcast / multiple encodings). The CF `/api/sfu/tracks` publish call must communicate the simulcast track correctly — confirm CF accepts the simulcast offer and the response is handled.
3. The pre-negotiated camera-off case (B2 addTransceiver with no track) must STILL set sendEncodings up front so layers exist when the camera turns on (replaceTrack keeps the simulcast encodings).
4. Screenshare track (B5b): keep it single-encoding (screenshare typically maintain-resolution, not simulcast) OR a sane single layer — do NOT break B5b. Simulcast applies to the CAMERA track here.
5. Do NOT implement subscriber layer selection (that's B6b) — B6a just PUBLISHES the layers.

## Scope guards
- Touch: `frontend/src/app/services/sfu-client.service.ts` (sendEncodings in the publish/transceiver setup), the e2e. Possibly tiny constants. Do NOT modify mesh webrtc.service.ts or the backend. Do NOT implement B6b subscriber prefs / B7 / B8.
- Must not regress B2 publish, B4 subscribe, B5a/b toggles/screenshare. The 2-client e2es from B4a/B5a should still pass.
- Do not deploy.

## Plan handshake (FIRST)
1. Read brief + files + handoff + the simulcast design constraint.
2. STATUS: PROPOSED — the exact sendEncodings layers (rids, scaleResolutionDownBy, maxBitrate), where they're set (doPublish for both camera-on and pre-negotiated camera-off), how the publish offer carries simulcast + that CF accepts it, how screenshare stays unaffected, and the test (assert the published video outbound-rtp shows multiple layers / the offer SDP has multiple RIDs). Split if bigger than one slice.
3. WAIT for APPROVED-PLAN.

## After APPROVED-PLAN
4. Implement. 5. Test — Playwright e2e (fake media + ?sfu=1, isolated 48xx ports + /tmp DB): a publishing client's video has multiple simulcast encodings — assert via getStats that there are multiple outbound-rtp video streams (one per rid) OR the sender getParameters().encodings has the rid layers active; AND a 2-client call still delivers video (no regression — B receives A's video framesDecoded>0). Robust polled assertions. 6. Frontend build + e2e green (run the B4a 2-client e2e too if quick, to confirm no regression). 7. Commit on feat/sfu-cutover.

## Callbacks + status
- Callback FIRST: append `[projcore callback] B6a <STATE> <note>` to `.../callbacks.md` (PROPOSED/DONE/BLOCKED) BEFORE prose.
- End every reply with `STATUS: <PROPOSED|DONE|BLOCKED> — <reason>`.
- Write `.../B6a/changes.md` at DONE. COMMIT before STATUS: DONE.
- If CF rejects the simulcast offer or headless can't produce multiple layers, don't spiral — report the specifics in PROPOSED or STATUS: BLOCKED.
