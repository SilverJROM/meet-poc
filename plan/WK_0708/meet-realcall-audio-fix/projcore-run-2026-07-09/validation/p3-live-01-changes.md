# P3-LIVE-01 — .140↔.123 topology + first live SFU smoke

## STATUS: BLOCKED (partial — real infra proven, one platform-level blocker remains)

## What was built (harness-only, no product scope creep)

- `e2e/harness/remote-cdp-host.ts` (new): SSH/CDP glue for a split-host call —
  `launchRemoteChrome`/`killRemoteChrome` (background Chrome on `.123`, CDP loopback-only),
  `openCdpTunnel`/`closeCdpTunnel` (SSH `-L` tunnel, CDP never touches the LAN),
  `setRemoteDefaultSource` (pactl virtual-mic routing), `startRemoteSpeechLoop`/`stopRemoteSpeechLoop`
  (background looped real playback into the sink the monitor-source "mic" listens to).
- `e2e/harness/call-driver.ts`: added `joinDualBrowserCallSplitHost()` (new export, existing
  `joinDualBrowserCall`/`dryRunDualBrowserCall` untouched) — identical room/ledger/recording/publish
  flow to `joinDualBrowserCall`, except speaker2's browser comes from `chromium.connectOverCDP()`
  instead of a second context on the same local `chromium.launch()`. Also exported
  `authenticateHarness` (was private) so a standalone smoke script can reuse it for room cleanup.
  Fixed two pre-existing-pattern-but-newly-copied `boolean|undefined` type errors with `Boolean(...)`.
- `e2e/harness/p3-live-01-smoke.ts` (new): the actual smoke — bot-140 local (fake-device + real
  speech WAV), bot-123 via CDP-remote (real-virtual-mic), memory guard (<2Gi avail → BLOCKED, not
  launch), evidence capture, inline room cleanup.

## Topology proven live (multiple runs)

1. SSH `silverjrom@192.168.254.123` passwordless — confirmed.
2. Remote Chrome launch + SSH-tunneled CDP connect — confirmed working end to end (isolated test:
   launch → tunnel up → `/json/version` reachable → clean kill, no leftover process).
3. **Found + fixed:** plain-http origin on a LAN IP (`http://192.168.254.140:4700`) leaves
   `navigator.mediaDevices` `undefined` in Chrome (insecure context) — reproduced identically for a
   fully-local two-fake-device call, so this was never CDP-remote-specific. `--unsafely-treat-insecure-origin-as-secure`
   did **not** fix it on this Chrome build (`window.isSecureContext` stayed `false`). Fix: a
   `*.localhost`-suffixed alias (`meet140.localhost`) mapped to the real IP via Chrome's own
   `--host-resolver-rules=MAP meet140.localhost 192.168.254.140` — Chrome auto-trusts any
   `*.localhost` origin; measured `isSecureContext: true` afterward. Applied to **both** legs (local
   Chrome needs it too — it's also loading the room page from its own LAN IP, not bare `localhost`).
4. With that fix, the **local fake-device leg alone reproducibly publishes** (`dryRunDualBrowserCall`
   against the `.localhost` alias: speaker1/speaker2 both >0 bytes, `success: true`).
5. **Found + fixed:** the PipeWire monitor-source "virtual mic" on `.123` is silent with nothing
   playing (verified directly: `parecord` on the monitor captured 0 bytes with nothing playing,
   ~328KB with `paplay` running concurrently). The original design played the speech WAV only in
   `onLive` (after the publish-bytes check) — too late, since with true silence into the SFU the
   outbound-rtp poll (8s) saw nothing to publish. Fixed: `startRemoteSpeechLoop` now plays the WAV
   on a background loop starting **before** the browsers join, so the mic is "live" through the
   whole publish-check window.

## Remaining blocker (this batch stops here)

Even with `XDG_RUNTIME_DIR=/run/user/1000` and `PULSE_SERVER=unix:/run/user/1000/pulse/native`
explicitly set for the SSH-launched remote Chrome (a non-interactive SSH session doesn't inherit the
desktop session's env, which is why `pactl`/`paplay` over the same channel work but Chrome's own
audio backend might not) — `navigator.mediaDevices.enumerateDevices()` on `.123`'s headless Chrome
**never lists an `audioinput` device**, only two `audiooutput` entries. Tried: `--headless=new`,
`--headless=old`, both env vars together, both without. Same result every time. This looks like a
headless-Chrome-on-Linux limitation for **real** input-device enumeration (fake-device capture is a
software path and unaffected; real hardware/PipeWire capture appears to need a real
X11/Wayland-integrated session that headless mode doesn't provide), not a config bug in the harness
glue above — but I have not proven that conclusively (haven't tried Xvfb + non-headless Chrome, which
is the next thing I'd try, and is more setup than "harness glue" — it needs an Xvfb install/check on
`.123`).

## What I recommend

1. **Try Xvfb + non-headless Chrome on `.123`** (`Xvfb :99 & DISPLAY=:99 chrome ... ` no `--headless`)
   — most likely fix if headless mode is really the limiter; needs confirming Xvfb is installed/usable
   there first.
2. If that's out of scope for a quick follow-up, **fall back to fake-device+real-speech-WAV on both
   legs** for the *topology* proof (CDP-remote to `.123` really does route a second physical machine
   into the SFU call; hearability just no longer comes from `.123`'s literal OS mic) — a scoped-down
   but still real dual-machine proof, pending JROM's call on whether that satisfies the Phase 3 intent.
3. Or treat this batch as DONE-for-topology / BLOCKED-for-real-mic and let a follow-up batch (its own
   ~30min box) attack the audio-input-enumeration blocker specifically, now that the two other real
   bugs (insecure origin, silent-mic-before-play) are already fixed and proven.

## Evidence

- `validation/p3-live-01-evidence/` (this batch produced no PASS run, so no receive-side WAV/result.json
  from `p3-live-01-smoke.ts` itself — the diagnostic runs that isolated each blocker were done via
  throwaway scripts, deleted after use, not checked in).
- Ledger/room cleanup: 10 harness-created rooms from this session's diagnostics (7 tracked in
  `e2e/ledger-state.json`, 3 created by raw diagnostic fetches outside the ledger) — all confirmed
  `DELETE /api/rooms/:id → HTTP 200`. No protected ID (`652c1475` / `testroom01001` / `TEST_ROOM01`)
  was touched. Remote Chrome + SSH tunnel + speech loop processes on `.123` confirmed killed after
  every test (`ps aux | grep chrome-linux64` → clean).
- `.140` available memory checked before every real launch attempt (stayed 28–29Gi avail throughout —
  no OOM risk materialized this batch, memory monitor not triggered).

## Burns

- `acceptanceAttempt: false` throughout — **0 cap burn**. `callBurnCount` unchanged (0/25).

## Commit

Not committed yet — brief said "commit when green" and this didn't reach green. The harness glue
(`remote-cdp-host.ts`, `call-driver.ts` additions, `p3-live-01-smoke.ts`) is real, tested-in-isolation
infrastructure (SSH/CDP/tunnel mechanics + 2 confirmed bug fixes), left in the working tree pending
coordinator direction on whether to land it now or fold in the Xvfb fix first.
