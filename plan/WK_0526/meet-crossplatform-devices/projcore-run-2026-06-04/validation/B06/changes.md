# Batch B06 Changes

## Branch: `feat/crossplatform-devices-20260604`

Cut from current branch checkpoint @ `b919e4d`. Not committed in this pass; APPROVED-PLAN says projcore runs an independent validator before commit.

## User Report (verbatim from brief)

"when a participant joins camera-OFF (video transceiver has null sender track) or publishes without a live audio track, later replaceVideoTrack/replaceAudioTrack only swaps the sender's track and DOES NOT register/announce the new track to the Cloudflare SFU + does not send sfu-publish → remote peers never subscribe → others can't see the mid-call camera / hear the recovered mic."

## Root Cause (mechanism-level)

`SfuClientService.doPublish()` only registered initial transceivers whose sender already had a live track; later `doReplaceVideoTrack()` / `doReplaceAudioTrack()` only called `RTCRtpSender.replaceTrack()`, so first mid-call audio/video tracks never reached CF `/tracks/new`, never entered `localPublishState.tracks`, and never triggered `sfu-publish`. Remote-side presence handling also only partial-subscribed newly-added `screen` tracks, so already-subscribed publishers could add audio/video trackNames without remote subscription.

## Code Changes

- `frontend/src/app/services/sfu-roster-utils.ts` — Added pure first-local-track and new-remote-track selectors to enforce first-add-only registration and no duplicate partial subscribes.
- `frontend/src/app/services/sfu-client.service.ts` — Added queued `replace*TrackAndPublishIfNeeded()` paths that register first mid-call audio/video tracks with CF `/api/sfu/tracks`, append local publish state only after CF answer, rollback pending offer plus sender track on failure, and generalize partial subscribe from screen-only to any new trackName.
- `frontend/src/app/pages/room/room.page.ts` — Routed in-call mic/camera replacement callbacks through the publish-if-needed paths and sends existing `sfu-publish` only when local publish state actually changes.
- `frontend/src/app/services/sfu-client.spec.ts` — Added strict pure assertions for late camera, late audio, existing on-join replacements, null tracks, generic audio/video/screen partial subscribe, and no double-subscribe.

## Commits

- Not committed — held for projcore independent 2nd-validator pass per APPROVED-PLAN.

## Standing Rules

- Future SFU mid-call local media additions must register with CF before broadcasting `sfu-publish`; announcing without CF registration is not a valid proof.
- Future remote presence partial-subscribe logic must diff trackName, not kind, because a known publisher can add audio, video, or screen after the initial subscription guard is set.

## Verification

- Type-check: PASS (`npx tsc -p frontend/tsconfig.app.json --noEmit`)
- Focused spec: PASS (`npx tsx frontend/src/app/services/sfu-client.spec.ts`)
- Build: PASS (`npm run build -w frontend`)
- DEV deploy: not deployed in this pass; validator runs before commit/deploy.
- Smoke verify: deterministic pure/unit only. Real remote-sees/hears for recovered mic and late camera remains JROM 2-machine/live-device verification; fake-media cannot honestly prove recovered physical mic audibility.

## Bug Reproductions

- Before: mechanism reproduced by code path inspection — `replaceAudioTrack` / `replaceVideoTrack` only called `replaceTrack`, while screen publish was the only mid-call path calling CF `/tracks/new` plus `sfu-publish`.
- After: verified with focused pure assertions and frontend build. Live remote media proof remains JROM 2-machine seat.

## Caveats

- [PRE-EXISTING] `npm run build -w frontend` still reports Angular/CommonJS warnings for unused `DatePipe` in `RoomsPage`, Stencil empty glob, and Mediapipe CommonJS. Not introduced by B06.
