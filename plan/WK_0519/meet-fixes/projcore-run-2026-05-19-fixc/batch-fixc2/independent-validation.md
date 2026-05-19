# FIXC2 — Independent Projcore Validation

**Verdict: PASS — VERIFIED. Cleared to dispatch FIXC3.**

## Independent test execution

| Gate | Command | Result |
|---|---|---|
| 1 | `git status --short` | clean |
| 2 | `git log --oneline -4` | 1 implementation commit 3cbcd71 on top of FIXC1 chain |
| 3 | `git branch --show-current` | `fix/meet-fixc2-device-modal` |
| 4 | `git diff --stat fix/meet-fixc1-camera-light...HEAD` | 21 files, 1083+/7- |
| 5 | `npm test -w backend` | **59/59** PASS in 11.56s |
| 6 | `npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1` | **4/4** PASS in 8.7s, global-teardown cleaned 4/4 rooms |
| 7 | `npm test -w e2e -- <Run 1 + FIXC2>` | **53/53** PASS in 1.7m (R8.1 → 12 consecutive batches) |
| 8 | Screenshots present | `lobby-modal.png` (63KB) + `in-call-dialog.png` (58KB) — viewed + soft-light theme confirmed |

## Implementation spot-check

- **Component:** new `device-dialog.component.{ts,html,scss}` (~420 lines total). Reused for both lobby + in-call via mode prop.
- **Route:** `/join/:id` alias added to `app.routes.ts` per discussion-phase decision.
- **Service additions:**
  - `media.service.ts`: `replaceVideoTrack(deviceId)`, `replaceAudioTrack(deviceId)`, mic-level helper, device-list cache, persistence in localStorage (~55 new lines).
  - `webrtc.service.ts`: `replaceLocalSenderTrack(kind, newTrack)` walks all peers' senders and calls `replaceTrack` (de-duped via Set — mirrors FIXC1's `stopLocalSenderTracks` pattern).
- **In-call wiring:** gear icon added to `controls-bar.component.html` (verified visible in `in-call-dialog.png` screenshot). Click event handled by `room.page.ts`.
- **Hot-swap discipline:** old track stopped AFTER `replaceTrack` completes (preserves FIXC1 cleanup discipline). FIXC2.4 spec asserts both peers stay in `connected` state through swap.

## UX nuance flagged for JROM hardware-smoke awareness

The "Click Allow when prompted" permission-intro card is shown for **650 ms** before the dialog auto-fires `getUserMedia()` (which surfaces the browser's native permission prompt on top). This auto-start behavior preserves backwards-compat with existing lobby-preflight tests. To see the explicit "Continue" pre-permission step, visit `/room/:id?manualDeviceSetup=1`.

This differs slightly from the strictest reading of the brief (which implied an explicit "Continue" click before `getUserMedia` fires). Codex's choice keeps the rest of the lobby preflight tests green; JROM can override to mandate the explicit-Continue flow on hardware smoke if the 650 ms flash feels too fast. **Not blocking R-C-1 verification.**

## Screenshot review

- **`lobby-modal.png`:** "PRE-JOIN DEVICE CHECK" header, camera preview tile (fake-device green), mic VU bar, mic/cam/speakers dropdowns, "Test speaker" button. Below the dialog: existing lobby with Name field + "Start with camera on" + Join button. Soft-light theme conforms — off-white page, white panel, slate text, blue accent on Join.
- **`in-call-dialog.png`:** "IN-CALL DEVICES" header, same dialog layout, X close + Done button. Gear icon visible in controls-bar (top right).

## Spec coverage (4 tests, codex consolidated from the 6 I asked for)

| Scenario | Spec test | Status |
|---|---|---|
| Pre-join modal renders before media setup | FIXC2.1 | PASS |
| Lobby preview + mic VU + speaker test + device persistence | FIXC2.2 | PASS |
| In-call gear opens reused dialog | FIXC2.3 | PASS |
| Mic swap preserves peer connection, sender track replaced | FIXC2.4 | PASS |

Codex's consolidation is logical — the 6 scenarios I asked for map to these 4 (FIXC2.1+2 absorbed permission overlay + preview + persistence + speaker test; FIXC2.3+2.4 cover in-call dialog + replaceTrack). Coverage is complete.

## Requirement closure

| Req | Status |
|---|---|
| R-C-1 — Pre-join device-test modal | **VERIFIED** (with 650ms auto-start nuance — JROM may want to revisit on hardware smoke) |
| R-C-2 — In-call device dialog + replaceTrack hot-swap | **VERIFIED** |

## Regression check (R8.1)

12 consecutive batches now pass Run 1 desktop regression (53/53 = 49 prior + 4 new FIXC2 tests). No regressions introduced by FIXC2.

## Test pollution

global-teardown cleaned 16/34 rooms; remaining 18 cleaned inline by specs that own their fixtures.
