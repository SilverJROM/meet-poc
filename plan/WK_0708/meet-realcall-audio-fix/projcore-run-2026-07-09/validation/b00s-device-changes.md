# B00S-DEVICE — changes.md

**Branch:** batch-01-diagnosis-2026-07-08
**Commit:** (pending — see below)

## Problem

`call-driver.ts` always injected `--use-fake-device-for-media-stream` into every
Chromium launch via `DEFAULT_LAUNCH_ARGS`, with no way to declare or opt out of it.
Every dual-browser call, including B08A-3's AC15 evidence run, therefore proved the
app only through Chrome's synthetic capture device — never a real PipeWire virtual
mic on `.123`. There was also no provenance record on `CallResult` of which device
mode or stimulus a given call actually used, so a validation report could silently
omit that information. Documented as Defect 2 in
`decisions/2026-07-09-north-structural-speech-device-plan.md`; corrected bindings in
`decisions/2026-07-09-north-structural-plan-approval.md` (#2, #5).

## Root cause

`DEFAULT_LAUNCH_ARGS` hardcoded fake-device as an unconditional default with no
config surface to change it, and `CallDriverConfig`/`CallResult` had no concept of
device mode or stimulus at all.

## Fix

1. **`call-driver.ts`:**
   - Removed `--use-fake-device-for-media-stream` from `DEFAULT_LAUNCH_ARGS`
     entirely (binding #1/#5).
   - Added `deviceMode: 'fake-device' | 'real-virtual-mic'` to `CallDriverConfig`,
     **required, no default** — both a TS compile-time requirement and a runtime
     guard (`if (!config.deviceMode) throw`) at the top of `joinDualBrowserCall`,
     so a dynamic/JS caller bypassing the type system still fails loudly instead
     of silently falling back to fake-device (binding #2).
   - Added `stimulus?: 'speech' | 'tone' | 'DC'`, `fakeAudioPath?: string`,
     `virtualMicSourceName?: string` to `CallDriverConfig`.
   - New exported pure function `buildLaunchArgs(config)`: for `fake-device`,
     pushes the fake-device flag and (if `fakeAudioPath` given) the
     `--use-file-for-fake-audio-capture` flag; if neither `fakeAudioPath` nor an
     existing `--use-file-for-fake-audio-capture` entry is present, logs a
     `console.warn` (JROM's APPROVED-PLAN open item #1: warn, not throw — several
     existing join/publish-only smokes don't assert hearability and shouldn't
     break). For `real-virtual-mic`, calls `assertRealVirtualMicHost()` (throws
     off `.123`) and, if `virtualMicSourceName` given, `pactl set-default-source`
     (throws on nonzero exit — no silent fallback to the wrong device); never
     pushes fake-device flags in this branch (binding #4).
   - New exported `isOnRealMicHost()` / `assertRealVirtualMicHost()`: true when
     `process.env.MEET_REAL_MIC_HOST === '123'` or a local network interface
     carries `192.168.254.123`. `.140` (this session's host, confirmed via
     `hostname -I`) has neither, so `real-virtual-mic` correctly throws here.
   - `CallResult` gained `provenance: { deviceMode, stimulus }` — direct
     passthrough of the config's values (binding #7); no auto-inference, so a
     future validator can flag a call whose `stimulus` was never declared as
     INVALID rather than have the harness guess one.
   - `joinDualBrowserCall` now calls `buildLaunchArgs(config)` instead of the old
     inline `[...DEFAULT_LAUNCH_ARGS, ...config.launchArgs]` merge, and attaches
     `provenance` to the returned `CallResult`.

2. **Call-site updates (all 3 files that consume `CallDriverConfig`/
   `joinDualBrowserCall`/`dryRunDualBrowserCall` — confirmed via repo-wide grep,
   nothing else imports these symbols):**
   - `e2e/harness/index.ts` — exports the 3 new types (`DeviceMode`, `Stimulus`,
     `CallProvenance`) plus `buildLaunchArgs`/`isOnRealMicHost`/
     `assertRealVirtualMicHost`.
   - `e2e/harness/__tests__/call-driver.test.ts` — added `deviceMode: 'fake-device'`
     to all 4 `CallDriverConfig` literals (2 `it.skip`, the `badConfig` negative
     test, and the `recordReceiveSide` config-shape test). `badConfig`'s existing
     assertions (error contains `Failed to create room` / `Failed to parse URL`)
     are unaffected — the `deviceMode` guard passes before the (still-failing)
     empty-`baseUrl` room-creation call runs.
   - `e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts` — added
     `deviceMode: 'fake-device', stimulus: 'speech'` to its one
     `joinDualBrowserCall` config. It already fed a real speech WAV
     (`alice-host.wav`) via raw `launchArgs`, so behavior is unchanged; this is
     provenance-only. Not re-run live this batch (would burn a call-ledger slot
     that B08A-3 already spent verifying; this batch's change to that file is
     additive config fields only, confirmed via `tsc --noEmit`, not a logic
     change).

3. **New smoke test — `e2e/harness/__tests__/b00s-device.test.ts`** (plain
   vitest, no Chromium needed for 10 of 11 cases):
   - `deviceMode` required: both `joinDualBrowserCall` and `dryRunDualBrowserCall`
     throw before any network call when `deviceMode` is stripped via `as any`.
   - `buildLaunchArgs`: fake-device flag appears exactly once (proves it comes
     from the conditional branch, not a stale default); `fakeAudioPath` wires the
     capture-file flag; warns (not throws) with no audio source; does not warn
     when the caller already supplied the file flag via raw `launchArgs`;
     real-virtual-mic branch contributes zero fake-device flags even when the
     caller's own `launchArgs` tries to smuggle them in; real-virtual-mic throws
     off `.123`.
   - `isOnRealMicHost()`: true with `MEET_REAL_MIC_HOST=123` env override, false
     without it on this host.
   - **Gated live smoke** (`it.skipIf(!isOnRealMicHost())`): would run one real
     `joinDualBrowserCall({ deviceMode: 'real-virtual-mic', ... })` against the
     dev server; skips cleanly on `.140` (confirmed no `pactl`, no `.123`
     interface) with a `console.log` documenting exactly what's needed to close
     it for real (run from `.123`, or an SSH/CDP remote worker there — dual
     asymmetric per-page device modes aren't buildable this batch since a single
     Chromium process's launch flags are process-wide, so one process can't mix
     fake-device on page1 with real-virtual-mic on page2).

## Evidence

- New test file: `npx vitest run harness/__tests__/b00s-device.test.ts` →
  **11 passed, 1 skipped** (the gated live smoke, expected on `.140`).
- Existing suite regression: `npx vitest run harness/__tests__ --exclude
  "**/*.browser.test.ts"` → **133 passed, 6 skipped**, 11/11 test files (prior
  baseline from B00S-SPEECH was 122 passed/5 skipped; +11 new passing tests here,
  +1 new skip = the gated smoke — no existing test broke).
- `npx tsc --noEmit -p e2e/tsconfig.json` — no new errors attributable to this
  batch's files (`call-driver.ts`, `index.ts`, the 2 updated test files, the new
  test file all type-clean). Pre-existing unrelated errors elsewhere in the
  package (`audio-rig.ts` Float32Array typing, `MeetDebug` property gaps in
  various `.spec.ts` files, `TEMP_DIR_B08S2` undefined-before-use in
  `call-driver.test.ts`'s pre-existing skipped block, etc.) are untouched by this
  diff and were present before it.
- Confirmed via `hostname -I` / `which pactl`: this session's host is `.140`
  (`192.168.254.140`, hostname `minisserver`), no `pactl` — matches the gated
  smoke's skip behavior.

## Scope discipline (per APPROVED-PLAN)

- Open item #1: fake-device without `fakeAudioPath` → `console.warn`, not a
  throw. Done as agreed.
- Open item #2: the 8 other files that pass `--use-fake-device-for-media-stream`
  directly (not through `CallDriverConfig`) — `gum-shim.browser.test.ts`,
  `b08a2-sender-liveness.browser.test.ts`, `b07-capture-injection.browser.test.ts`,
  `b08s2-receive-capture-hook.browser.test.ts`, the 3 `playwright.*.config.ts`
  files, `mic-persist.spec.ts`, `b1-remote-join.spec.ts`,
  `b1-remote-orchestrator.ts` — left untouched this batch, documented as a
  follow-up. `CallDriverConfig` is the hearability/AC2 path; these are separate
  harnesses with their own launch-arg shapes.
- Open item #3: B06 `WeakSourceControl` live wiring — skipped, no `.123`
  reachability this session to verify `pactl` source names against. Gap
  documented above and in the PROPOSED plan.
- `deviceModeBySpeaker` / true per-page asymmetric dual-browser — not built
  (needs a `.123`-side Chromium via CDP/SSH); documented as a gap in the smoke
  test's skip message, not silently dropped.
- B00S-RELOAD, budget ledger rewrite — untouched, per brief.
- 0 acceptance burns: this batch never calls `joinDualBrowserCall`/
  `dryRunDualBrowserCall` against a live server (the new smoke's live case
  correctly skips off `.123`); no `call-ledger` interaction beyond what the
  pre-existing test suite already exercised.
