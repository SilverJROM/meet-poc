# Validation: B3 — SR-3 SFU Signaling Presence

Validator: Codex independent validator  
Commit validated: `66ab520a3ad1b742a782e044c1e7e388cb3c65fb` on `feat/sfu-cutover`  
Requirement: `plan/WK_0519/sfu-cutover/og-requirements.md` SR-3

## Verdict

VALIDATED-PASS

## Scope Reviewed

- `git show 66ab520` reviewed.
- Changed source files:
  - `backend/src/modules/signaling/index.ts`
  - `backend/tests/signaling-sfu-presence.test.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/services/sfu-client.spec.ts`
  - `frontend/src/app/services/sfu-roster-utils.ts`
  - `frontend/src/app/services/ws.service.ts`
- Confirmed `frontend/src/app/services/webrtc.service.ts` is unchanged in commit `66ab520`.
- Checked B3 `changes.md` and `callbacks.md`.

## Requirement Checks

| Check | Result | Evidence |
|---|---|---|
| Backend adds `sfu-publish` handler | PASS | `backend/src/modules/signaling/index.ts:821` handles admitted-only `sfu-publish`, validates `cfSessionId` and `tracks`, stores presence. |
| Presence stored in `LiveRoom` keyed by client | PASS | `LiveRoom` adds `sfuPresence: Map<string, SfuPresenceEntry>` and revision counter; handler stores with `live.sfuPresence.set(clientId, sfuEntry)`. |
| Presence payload includes `{cfSessionId, tracks}` | PASS | `SfuPresenceEntry` carries `clientId`, `participantId`, `cfSessionId`, `tracks`, `revision`; outgoing `sfu-presence` spreads the stored entry. |
| Monotonic revision | PASS | `live.sfuPresenceRevision += 1` before storing each publish; backend test asserts repeated publishes increase revision. |
| Broadcast `sfu-presence` to room peers | PASS | Handler broadcasts to other admitted peers with `type: 'sfu-presence'`. This matches remote-publisher roster semantics; sender does not need its own remote roster entry. |
| Full `sfu-roster` snapshot on join/admit | PASS | `sendSfuRosterToNewPeer()` sends all stored publishers after `admitted` in both owner/resume and knock-admit paths. |
| Cleanup on leave/disconnect/expire/meeting-ended | PASS | Explicit leave/host remove path deletes presence via `removeAdmittedPeer`; admitted websocket close deletes presence before reconnect grace; empty room and host-ended meeting delete the `LiveRoom`. Expire has no stale entry left after close-path deletion. |
| Frontend `remotePublishers` signal | PASS | Added to `SfuClientService`. |
| Frontend `handleSfuPresence` stale rejection | PASS | `applyPresenceUpdate()` applies strictly newer revision and returns unchanged map for older-or-equal revision. |
| Frontend `handleSfuRoster` replace | PASS | `applyRosterSnapshot()` builds a new map from the snapshot only. |
| Frontend `removePeer` | PASS | `removeFromRoster()` deletes by `clientId`; room `peer-left` handler calls `sfuClient.removePeer()`. |
| `ws.service.ts` message types | PASS | Added inbound `sfu-presence`/`sfu-roster` and outbound `sfu-publish`. |
| `room.page` announces publish behind `?sfu=1` | PASS | After `sfuClient.publish()` resolves, room sends `sfu-publish` only in the existing `?sfu=1` branch. |
| Mesh WebRTC unchanged | PASS | `git diff 66ab520^ 66ab520 -- frontend/src/app/services/webrtc.service.ts` is empty. |
| Existing admit/chat/media-state not regressed | PASS | Diff preserves existing handlers; focused backend regression tests passed. |
| No unrelated source/logic changes | PASS | Commit changes are limited to SR-3 signaling, SFU roster frontend state, tests, and expected B3 artifact/callback files. |

## Commands Run

- `npm run build -w backend` — PASS
- `npm test -w backend -- tests/signaling-sfu-presence.test.ts` — PASS, 1 file / 3 tests
- `npm run build -w frontend` — PASS; emitted existing Stencil empty-glob warning only
- `npx tsc -p tsconfig.spec.json` from `frontend/` — PASS
- `node out-tsc/spec/sfu-client.spec.js` from `frontend/` — PASS, all assertions passed
- Extra focused regression check: `npm test -w backend -- tests/signaling-knock-admit.test.ts tests/signaling-chat.test.ts tests/signaling-media-state.test.ts` — PASS, 3 files / 8 tests

## Notes

- Working tree had pre-existing unrelated dirty plan/screenshot/generated artifacts before validation. I did not edit source.
- The frontend SFU spec is a Node-run compiled TypeScript spec, not an Angular `ng test` spec; I compiled `tsconfig.spec.json` before running the generated JS.

STATUS: VALIDATED-PASS
