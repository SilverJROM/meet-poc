# B00S-DEVICE — PROPOSED

## Recon (done, informs plan below)
- This session is running **on `.140`** (`192.168.254.140`, hostname `minisserver`), **no `pactl`** on PATH. Confirms brief's own contingency: "if remote Chromium on .123 is not feasible this batch, implement the API + unit tests + a `.123`-gated smoke." I cannot exercise a real dual-browser real-virtual-mic call live this batch — going the gated-smoke route, not the live-demo route.
- `CallDriverConfig`/`joinDualBrowserCall`/`dryRunDualBrowserCall` (the only symbols that need `deviceMode`) are consumed in exactly 3 files: `e2e/harness/index.ts` (re-export only), `e2e/harness/__tests__/call-driver.test.ts` (4 `CallDriverConfig` literals), `e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts` (1 literal, already fake-device + real speech file via raw `launchArgs`). Everything else that passes `--use-fake-device-for-media-stream` (`gum-shim`, `b08a2`, `b07-capture-injection`, `b08s2-receive-capture-hook`, playwright configs, `mic-persist.spec.ts`, `b1-remote-join.spec.ts`, `b1-remote-orchestrator.ts`) builds its own Chromium launch args directly and never touches `CallDriverConfig` — out of scope for this batch (brief scopes call sites to "chromium for calls/tests" through this API; these are separate harnesses with their own launch paths, not CallDriver).
- Current architecture: **one Chromium process** serves both `page1`/`page2` (`browser = await chromium.launch({ args: launchArgs })`, both contexts share it). Launch flags (`--use-fake-device-for-media-stream` etc.) are process-wide — Chromium has no per-context override for gUM fakery. So a single `joinDualBrowserCall` call cannot mix "page1 = fake-device" and "page2 = real-virtual-mic" today. This matches the brief's own fallback clause (§ Implementation sketch, "if remote Chromium on .123 is not feasible this batch") — I'm implementing the **minimum acceptable** list (a)-(e) literally, not the stretch `deviceModeBySpeaker` dual-process design (that needs a real .123 CDP/SSH worker, which isn't practical from `.140` this batch).
- `weak-source-control.ts` (B06) is confirmed still scaffold-only (`applyAttenuation` returns `false` unless `B06_MOCK_REACHABLE=true`). Brief lists "Wire B06" as **optional stretch if smoke lands** — given no `.123` reachability this session, I'm leaving it untouched and documenting the gap, not wiring it.

## 1. `call-driver.ts` changes
1. **Remove** `--use-fake-device-for-media-stream` from `DEFAULT_LAUNCH_ARGS` (binding #1) — it becomes conditional, added only for `deviceMode: 'fake-device'`.
2. **New types:**
   ```ts
   export type DeviceMode = 'fake-device' | 'real-virtual-mic';
   export type Stimulus = 'speech' | 'tone' | 'DC';
   export interface CallProvenance {
     deviceMode: DeviceMode;
     stimulus?: Stimulus;
   }
   ```
3. **`CallDriverConfig`:** add `deviceMode: DeviceMode` (**required**, no `?`, no default — TS compile fails on omission) + `stimulus?: Stimulus` + `fakeAudioPath?: string` + `virtualMicSourceName?: string`. Also add a **runtime guard** (`if (!config.deviceMode) throw`) at the top of `joinDualBrowserCall` — belt-and-suspenders per brief's "fail at TypeScript/compile **or** runtime throw," and it's the only way to unit-test the requirement without a full `tsc` pass in vitest.
4. **`buildLaunchArgs(config)`** (new, exported for unit testing — pure function):
   - `fake-device`: pushes `--use-fake-device-for-media-stream`; if `config.fakeAudioPath` set, also pushes `--use-file-for-fake-audio-capture=<path>`. If neither `fakeAudioPath` nor an existing `--use-file-for-fake-audio-capture` in `config.launchArgs`, logs a `console.warn` (not a throw — several existing join/publish-only smokes don't care about audio content) pointing at this file's contract.
   - `real-virtual-mic`: calls `assertRealVirtualMicHost()` (throws if not on `.123`); if `config.virtualMicSourceName` given, calls `setVirtualMicDefaultSource()` (spawns `pactl set-default-source <name>`, throws on nonzero exit — no silent fallback, since a wrong default source would silently make the call fake-hearability again). **Never** pushes `--use-fake-device-for-media-stream` or `--use-file-for-fake-audio-capture` in this branch (binding #4).
5. **`isOnRealMicHost()` / `assertRealVirtualMicHost()`** (new, exported for unit testing): true when `process.env.MEET_REAL_MIC_HOST === '123'` **or** a local network interface has address `192.168.254.123`. Env var lets a real `.123` test runner opt in explicitly without relying on interface enumeration.
6. **Provenance on `CallResult`:** add `provenance: CallProvenance` (`{ deviceMode: config.deviceMode, stimulus: config.stimulus }`, direct passthrough — no auto-inference magic, so a future validator can flag a call whose `stimulus` was never declared as INVALID rather than have the harness quietly guess one).
7. `joinDualBrowserCall` calls `buildLaunchArgs(config)` in place of the current `[...DEFAULT_LAUNCH_ARGS, ...(config.launchArgs||[])]` inline merge; attaches `provenance` to the returned `CallResult`.

## 2. Call-site updates (deliverable #2)
- `e2e/harness/__tests__/call-driver.test.ts`: add `deviceMode: 'fake-device'` to all 4 `CallDriverConfig` literals (2 `it.skip` configs, the `badConfig` config, the `recordReceiveSide` type-check config). `badConfig`'s existing assertions (error message contains `Failed to create room` or `Failed to parse URL`) are unaffected — `deviceMode` validation passes before the (still-failing) empty-`baseUrl` room-creation call.
- `e2e/harness/__tests__/b08a3-live-sender-liveness.browser.test.ts`: add `deviceMode: 'fake-device', stimulus: 'speech'` to its one `joinDualBrowserCall` config (already correctly uses a real speech WAV via raw `launchArgs` — leaving that line as-is, minimal diff).
- `e2e/harness/index.ts`: export the 3 new types (`DeviceMode`, `Stimulus`, `CallProvenance`) alongside the existing `CallDriverConfig`/`CallResult` re-export.

## 3. New smoke test — `e2e/harness/__tests__/b00s-device.test.ts` (plain vitest, no server needed for most cases)
- `deviceMode` required: constructs a config with `deviceMode` stripped via `as any`, asserts `joinDualBrowserCall`/`dryRunDualBrowserCall` throw before any network call.
- `isOnRealMicHost()` / `assertRealVirtualMicHost()`: unit tests via `MEET_REAL_MIC_HOST` env var mocking (true/false cases), restoring `process.env` after.
- `buildLaunchArgs()`: fake-device path always includes `--use-fake-device-for-media-stream`; real-virtual-mic path (mocked to pass the host assertion via env var) never includes `--use-fake-device-for-media-stream` or `--use-file-for-fake-audio-capture`, regardless of what's in `config.launchArgs`.
- **Gated live smoke** (`it.skipIf(!isOnRealMicHost())`): would run one real `joinDualBrowserCall({ deviceMode: 'real-virtual-mic', ... })` against a live dev server. On this host (`.140`) it **skips** with a clear reason string; documents in a comment that closing it for real requires either running this suite from `.123` directly or a remote/SSH Playwright worker there (per brief's explicit fallback) — logged, not silently omitted.
- Following the "smoke only, log duration+purpose, do NOT acceptance-burn if <60s" note: the gated smoke (when it does run on `.123`) will log its own duration via `console.log`; it does not call `incrementCallBurn` beyond whatever `joinDualBrowserCall` already does internally (unchanged from existing behavior).

## 4. Out of scope (confirming against brief)
- B06 `WeakSourceControl` live wiring — optional stretch, not done (no `.123` reachability this session to verify pactl source names against).
- `deviceModeBySpeaker` / true per-page asymmetric dual-browser — needs a `.123`-side Chromium (CDP remote or SSH worker); documented as a gap, not built.
- B00S-RELOAD, budget rewrite — untouched, per brief.
- The 8 other files that pass `--use-fake-device-for-media-stream` directly (not through `CallDriverConfig`) — untouched; they don't call `joinDualBrowserCall`/`dryRunDualBrowserCall` so the brief's "call sites that launch chromium for calls/tests" via **this API** doesn't reach them. Flagging in case you want those swept too — would be a separate, larger-diff task (8 files, each with its own launch/config shape).

## 5. Estimate
- `call-driver.ts` (types, `buildLaunchArgs`, host assertion, provenance): ~12 min.
- Call-site updates (3 files, mechanical): ~5 min.
- New smoke test file: ~10 min.
- changes.md + commit: ~5 min.
- Total: ~30 min, impl L2 sonnet, matches brief's "smoke only" budget.

## Open items I'm flagging rather than deciding unilaterally
1. **Fake-device-without-audio-source**: warning (`console.warn`), not a throw — chosen so existing join/publish-only mechanics tests (that don't assert hearability) keep working. If you want this to hard-fail instead, say so and I'll flip it to a throw + update call sites that would then need a `fakeAudioPath`.
2. **The 8 non-`CallDriverConfig` call sites** (gum-shim, b08a2, b07, b08s2-receive-capture-hook, 3 playwright configs, mic-persist, b1-remote-*) — leaving untouched per the "this API" reading of deliverable #2. Confirm if you want the sweep widened.
3. **B06 wiring** — confirmed skip (no `.123` reachability), not attempting even the "behind a feature flag" stretch this batch.

Awaiting APPROVED-PLAN.
