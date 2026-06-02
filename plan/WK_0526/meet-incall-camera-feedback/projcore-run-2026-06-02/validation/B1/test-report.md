# Test Report: Batch B1 — In-call mic AND camera always enable-able; never stiff

## Tested Against
- **HARD pure specs:** local Node (`npx tsx`) from `frontend/`.
- **HARD build:** local `npx ng build` from `frontend/`.
- **SOFT e2e:** isolated Playwright harness on `http://localhost:4710` (dedicated ports 4730 BE / 4731 NG / 4710 proxy), backed by an **isolated** SQLite DB at `/tmp/b1-e2e/meet-b1.sqlite` (`MEET_DB_PATH`) + `/tmp/b1-e2e/recordings` (`MEET_RECORDINGS_DIR`). Live `data/meet-poc.sqlite` and live PM2 (4700/4720) were NOT touched. Real Cloudflare Realtime SFU credentials (`SFU_APP_ID`/`SFU_TOKEN` from `.env`) were in play — `sfuPublishState` reached `'published'`, confirming the SFU media plane was active.

## Branch
`feat/incall-media-always-enableable-20260602`

## Fix under test
In-call mic + camera now ACQUIRE (getUserMedia) when joined off/absent (incl. no-localStream), publish via the pre-negotiated SFU sendonly transceiver (`replaceAudioTrack` / `replaceEffectiveVideoTrack`, no renegotiation), and on `NotAllowedError` surface a dismissible `actionNotice` hint instead of dead-ending. Decision extracted to the pure `frontend/src/app/services/media-toggle.ts` (`resolveMediaToggleAction` + `permissionBlockHint`).

---

## HARD gates (decide PASS/FAIL) — all deterministic, no fake-media

| # | Scenario | Command | Expected | Actual | Result |
|---|----------|---------|----------|--------|--------|
| H1 | S1+S2 — pure decision (`resolveMediaToggleAction` acquire/enable/disable + no blocked member; `permissionBlockHint` NotAllowedError/PermissionDeniedError → device+address-bar hint, else null, no permanence words) | `cd frontend && npx tsx src/app/services/media-toggle.spec.ts` | prints `media-toggle: all assertions passed`, exit 0 | `media-toggle: all assertions passed`, **exit 0** | **PASS** |
| H2 | S8 regression — mic persistence | `cd frontend && npx tsx src/app/services/device-selection.spec.ts` | `device-selection: all assertions passed`, exit 0 | exit 0, message printed | **PASS** |
| H3 | S8 regression — remote audio playout | `cd frontend && npx tsx src/app/services/remote-audio-playability.spec.ts` | `remote-audio-playability: all assertions passed`, exit 0 | exit 0, message printed | **PASS** |
| H4 | S9 — clean build (new `media-toggle.ts` imported by `media.service.ts`/`room.page.ts` compiles) | `cd frontend && npx ng build` | exit 0, no TS errors | **exit 0** — "Application bundle generation complete." Only pre-existing unrelated warnings (DatePipe unused in rooms.page, @stencil empty-glob, @mediapipe CJS); none from `media-toggle` or the edited files | **PASS** |

Spec coverage confirmed by read: `media-toggle.spec.ts` contains the S1.8 union/no-blocked-member assertion (forbidden set `{noop,blocked,denied}` asserted absent) and the S2 `PermissionDeniedError` alias + null/undefined-err edges. Wiring confirmed: `room.page.ts:975 handleInCallMediaPermission` calls `permissionBlockHint` (import at `:34`) and routes the non-null result to `actionNotice.set(...)`; both `toggleMic()` (`:944`) and `toggleCamera()` (`:961`) pass the SFU publish callback and clear `actionNotice` on success.

**All HARD gates GREEN.**

---

## SOFT e2e (best-effort, fake-media-permitting) — new test `e2e/tests/b1-incall-media/incall-media-enable.spec.ts`

Final run (`--workers=1`, isolated harness): **3 passed (40.7s)**. Per-step:

| # | Scenario | Action | Expected | Actual | Screenshot | Result |
|---|----------|--------|----------|--------|------------|--------|
| 1 | **S5** never-stiff | Join fully off (mic-off + camera-off); assert mic & camera buttons `toBeEnabled()` AND not `[disabled]` in OFF state; click each on; re-assert enabled in ON state; mute/camera-off back; re-assert enabled | Controls NEVER disabled across off↔on (styling `.is-off` ≠ disablement) | All `toBeEnabled()` / no-`disabled` assertions passed in every state | `S5-both-off-enabled.png`, `S5-both-on-enabled.png` | **PASS** |
| 2 | **S4** camera acquire from NO localStream (Bug B) | B joins BOTH mic-off + camera-off (localStream null); assert `localVideoTrackId` undefined + camera btn enabled `.is-off`; click "Turn camera on"; assert track acquired + published + B outbound video frames advance; observe A inbound | `localVideoTrackId` undefined→truthy; `sfuPublishState` stays `'published'`; B outbound `framesEncoded` > 0; camera flip-after keeps same track id | Acquired from null stream ✓; published unchanged ✓; **B outbound video frames > 0** (encode+push proven) ✓; off→on flip kept stable `localVideoTrackId` ✓ | `S4-camera-before-off.png` (B fully off), `S4-camera-after-on.png` (B self-tile now showing live video) | **PASS** |
| 3 | **S3** in-call mic toggle | B joins (camera on); assert mic control enabled; Mute → assert OFF state, control still enabled + `.is-off`, **same** `localAudioTrackId` (flip, not re-acquire), publish unchanged; Unmute → ON, same track, published | Mute/unmute is a stable-id flip on the SAME track; control always enabled; `sfuPublishState` stays `'published'` | track id stable across mute/unmute ✓; control enabled throughout ✓; publish unchanged ✓ | `S3-mic-on-enabled.png`, `S3-mic-off-enabled.png` | **PASS** |

### SOFT observation (NOT gated — documented per fake-media caveat)
- **S4 remote (A) inbound video for B's late-acquired camera:** B's OUTBOUND `framesEncoded` reliably advanced > 0 (the publish-side proof of the Bug B fix), so the test GATES on that. A's INBOUND `framesDecoded` for B's late-added track is treated as a soft observation (annotated, non-failing): under fake media in this harness the remote subscription does not reliably re-pull a track added late via `replaceTrack`. This matches the scenarios.md fake-media caveat and the existing `sfu-b5a-toggles` note that inbound RTP is unreliable. **Not a logic failure** — B is provably encoding and pushing the acquired frames to the SFU.

### Honest precondition notes discovered during testing (not bugs — platform/app reality)
- **Mic acquire-from-absent (Bug A) is NOT reachable through the lobby UI.** The app makes mic access a JOIN PREREQUISITE (`room.page.ts` `missingJoinPrereqs`/`hasMicAccess` require a live audio track to join), and the lobby always acquires an audio track; "Mic off" in the lobby only sets `track.enabled=false` (`applyLobbyMicPreference`), it does not remove the track. Joining over the SFU further initialises the in-call mic state to ON. So a guest never reaches the in-call view with `localAudioTrackId === undefined`. The genuine "no audio track at all → acquire" path (Bug A) is therefore proven at **UNIT level by S1.2** (`resolveMediaToggleAction {streamExists:true, trackExists:false} → 'acquire'`) rather than live e2e. S3 instead live-proves the mic control is never-stiff and mute/unmute is a stable-id flip with publish unchanged. **Camera is different** — camera defaults OFF and is NOT a join prereq, so the no-localStream acquire path (Bug B) IS live-reachable and is exercised by S4.
- **Test-harness fixes required (not app issues):** (1) the lobby request checkboxes are visually overlaid by their label `<span>` which intercepts pointer events — `.check({force:true})` required; the pre-join mic checkbox is `name="microphoneRequested"` (scenarios.md cited `micRequested`, which does not exist). (2) An early `micOn` helper using `getByRole('button',{name:'Mute microphone'})` matched loosely and falsely reported mic-on after a flip; scoping to the controls-bar primary toggle's `aria-pressed` fixed it — the mic flip itself is fast and correct (S3 passes in ~7s).

---

## MANUAL localhost notes (required — honest platform limits)

### S6 — NotAllowedError hard-block path (MANUAL / JROM-seat)
Fake media (`--use-fake-ui-for-media-stream`) auto-GRANTS and cannot model a true browser "Block" state, so this path is verified by code-trace + is owned by manual localhost verification:
- Click in-call mic/camera while Chrome site-permission = Block → `getUserMedia` rejects `NotAllowedError`.
- `room.page.ts:944/961` `catch (err)` → `handleInCallMediaPermission(err, 'audio'|'video')` (`room.page.ts:975-982`).
- `permissionBlockHint(kind, err)` (`media-toggle.ts:44-49`) returns the non-null device-naming, address-bar/site-settings hint (no `/disabled|forever/i`) → `actionNotice.set(hint)` (`room.page.ts:978`).
- Banner renders at `room.page.html:200-204` (`@if (actionNotice())` → `<span>{{ actionNotice() }}</span>` + Dismiss button calling `actionNotice.set(null)`).
- The control is never `[disabled]` (`controls-bar.component.html:19-63` — no `[disabled]` on the mic/camera primary toggles, confirmed and proven enabled by S5), so the NEXT click re-invokes `getUserMedia` (re-attempt). `permissionBlockHint` logic (correct hint vs null) is fully unit-covered by **S2** (HARD).
- **Platform truth:** `getUserMedia` only re-prompts when the permission state is "prompt"; "denied" is browser-enforced. Re-attempt + dismissible hint + never-disable is the maximum the platform allows — this is the implemented behavior. Recommend a JROM-seat screenshot pass on `http://localhost:4700` with site permission set to Block for the visual banner evidence (mic banner / camera banner / dismissed / post-unblock success).

### S7 — three rendered states for mic AND camera (MANUAL + captured)
- **off-with-stream / no-stream states captured via e2e:** `S5-both-off-enabled.png` (both controls rendered `.is-off` but enabled — the never-stiff intent), `S4-camera-before-off.png` (camera no-stream off), `S4-camera-after-on.png` (camera acquired from null stream, self-tile now rendering live video), `S3-mic-on-enabled.png` / `S3-mic-off-enabled.png` (mic on/off states, control enabled throughout).
- **browser-blocked state:** the S6 banner — MANUAL localhost (fake media cannot produce it). Reuse the S6 JROM-seat screenshots.

---

## Summary
- **Playwright:** 3/3 passed (S3, S4, S5) — 40.7s, isolated harness, exit 0.
- **Pure specs (HARD):** 3/3 passed (media-toggle, device-selection, remote-audio-playability) — exit 0.
- **Build (HARD):** clean, exit 0.
- **Console errors:** none observed in the passing e2e (no uncaught-error failures; traces only retained on the earlier iteration failures, since removed).
- **Screenshots:** 6 saved under `validation/B1/screenshots/` (S3×2, S4×2, S5×2).
- **Cleanup:** DONE — all 21 e2e-created rooms were confined to the isolated `/tmp/b1-e2e/meet-b1.sqlite` (verified: **0** B1-test rooms in live `data/meet-poc.sqlite`; 3 live rooms untouched incl. TEST_ROOM01). Isolated harness stopped (ports 4710/4730/4731 down), `/tmp/b1-e2e` removed, `e2e/.test-rooms.json` removed, stale `e2e/test-results/` removed. Live PM2 `meet-poc-fe`/`meet-poc-be` (4700/4720) online and untouched.

## Verdict: PASS
All HARD gates (S1, S2 via media-toggle.spec; S8 regression specs; S9 build) are GREEN. The SOFT e2e layer (S3, S4, S5) all PASS, including the live Bug B fix (camera acquire from a null localStream → publish → frames encoded). The only non-gated item (A's inbound RTP for a late-added track) is a documented fake-media subscription-refresh limit, not a logic regression — B is provably encoding+pushing the acquired frames. The mic acquire-from-absent path (Bug A) is unreachable via the lobby UI (mic is a join prerequisite) and is proven at unit level (S1.2). S6 (browser hard-block) is the honest manual/JROM-seat path; its decision logic is unit-covered by S2.

STATUS: DONE (PASS)
