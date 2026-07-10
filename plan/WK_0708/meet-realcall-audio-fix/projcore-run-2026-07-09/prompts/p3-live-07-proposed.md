# P3-LIVE-07 PROPOSED plan

## Minimal product change: query-param-gated AGC/NS/EC disable

**Single source of truth found**: `frontend/src/app/services/mic-energy.ts:47-55`,
`audioCaptureConstraints(audio, deviceId)` — a pure, framework-free builder returning
`{ echoCancellation: {ideal:true}, noiseSuppression: {ideal:true}, autoGainControl: {ideal:true},
...deviceId }`. Called from exactly one place, `frontend/src/app/services/media.service.ts:560-564`
(`private audioConstraints()`), which itself feeds every `acquireAudio()` call site in that file
(lines 86, 127, 156, 338 — covers preflight, join, device-switch, re-acquire). This is the **only**
gUM constraint site for audio in the whole app — confirmed via grep, not assumed.

**Change**: add an optional third parameter, `disableProcessing = false`, to
`audioCaptureConstraints()` — when true, requests `echoCancellation: false, noiseSuppression:
false, autoGainControl: false` (hard boolean, not `{ideal:false}`) instead of the current
`{ideal:true}` trio; `deviceId` handling unchanged. `media.service.ts`'s `audioConstraints()`
gains a private `shouldDisableAudioProcessing()` helper reading
`new URLSearchParams(window.location.search).get('e2eDisableAudioProcessing') === '1'` and passes
it through. **Default behavior for every real user is byte-for-byte unchanged** — the query param
is absent on every real join URL, so `shouldDisableAudioProcessing()` returns `false` and
`audioCaptureConstraints()` returns exactly what it returns today.

**Why a query param, not a `deviceMode`-keyed harness flag**: the app has no concept of
`real-virtual-mic` vs `fake-device` — that's a harness-only distinction (`call-driver.ts`'s
`DeviceMode`). A query param is the smallest surface that's (a) verifiable by inspecting the join
URL, (b) zero-risk to the default path (never present unless explicitly added), (c) doesn't
require plumbing a new concept through Angular DI/signals. Chose `e2eDisableAudioProcessing` (not
a generic name) so it reads unambiguously as test-only if anyone ever sees it in a URL or log.

## Harness wiring

`call-driver.ts`'s `joinDualBrowserCallSplitHost` navigates both `page1`/`page2` to the **same**
`roomUrl` (line 617, 643, 655) — I'll add one new optional `CallDriverConfig` field,
`speaker2ExtraQuery?: string`, and build `page2`'s URL as `` `${roomUrl}?${speaker2ExtraQuery}` ``
when set (page1's URL/behavior unchanged — the real-user/default fake-device path is untouched).
`p3-live-07-smoke.ts` (copy of `p3-live-06-smoke.ts`) passes
`speaker2ExtraQuery: 'e2eDisableAudioProcessing=1'`.

## Build

Per project convention (FE is a prebuilt static bundle — `ng build` required to ship), I'll run
`ng build` in `frontend/` after the change and confirm the dev server is serving the rebuilt bundle
before re-running the live smoke (matches this run's standing `Deploy model` note).

## Verification (brief item 4)

After the constraint change, re-run the live smoke and read `getSettings()` on bot-123's actual
captured track (same diagnostic P3-LIVE-06 already added) — confirm all three read `false`, not
just assume the constraint request took effect (a device/browser can still decline a plain
`false` request in theory, same as it can decline `{ideal:true}`).

## Acceptance

`acceptanceAttempt:false`, both `publishedBytes>0`, receive `rms>0` via the already-shipped
`startRawRemoteStreamCapture()` (P3-LIVE-06). Evidence → `validation/p3-live-07-evidence/`.
If still silent with constraints confirmed `false`: **STATUS:BLOCKED with the new evidence**, not
a false-green — per this run's standing real-call-acceptance rule.

## Risk

- Product code change, scoped to exactly 2 files (`mic-energy.ts`, `media.service.ts`), additive
  parameter with a `false` default — no behavior change on any path that doesn't pass the query
  param. Will grep post-change to confirm no other caller of `audioCaptureConstraints()` exists
  that could be affected.
- `ng build` + serving the rebuilt bundle is required for this to take effect live (matches
  standing deploy-model note) — will confirm the dev server picks up the new build before testing.
- Memory noted as possibly tight this batch (brief's own flag) — `free -h` checked before launch,
  BLOCKED if avail <2Gi, no override.

Awaiting APPROVED-PLAN before implementing.
