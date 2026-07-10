# P3-LIVE-02 changes.md

## Summary

Batch requirement: ".123 Chrome must enumerate audioinput; one PASS live split-host SFU smoke
(publish both + receive energy)."

- **Audioinput requirement: MET, and the brief's own recommended fix (Xvfb) is proven wrong.**
  Empirically disproved "headless Chrome can't see input devices" (Xvfb+non-headless gave the
  identical 0-audioinput / `NotFoundError` result as plain headless). Real cause: Chrome's
  PulseAudio backend excludes `device.class=monitor` sources from mic enumeration by design; .123's
  only "virtual mic" route was exactly such a monitor source. Fix: `pactl load-module
  module-remap-source` wraps it as a non-monitor source Chrome will enumerate — proven under both
  headless and non-headless Chrome. Chrome stays headless (matches P3-LIVE-01, smaller diff).
- **One PASS live smoke: NOT MET.** Both legs join and publish successfully (server-confirmed,
  `sfu-publish` for both bot-140 and bot-123). Receive-side WAV capture then throws `INVALID_NO_PC`
  — a new, downstream, pre-existing issue unrelated to Xvfb/audioinput. Full repro + evidence +
  recommendation: `decisions/2026-07-10-p3-live-02-invalid-no-pc.md`.

**STATUS: BLOCKED**, not DONE — the batch's stated acceptance bar (one PASS with receive energy) is
not met, and per this run's standing rule (real-call acceptance, no false-green), that isn't
reported as a pass.

## Files changed

- `e2e/harness/remote-cdp-host.ts`: added `loadRemoteVirtualMic(config, monitorSourceName,
  virtualSourceName)` and `unloadRemoteVirtualMic(config, moduleId)` — thin `pactl load-module
  module-remap-source` / `unload-module` wrappers. No change to `launchRemoteChrome` (still
  `--headless=new`, byte-identical args to P3-LIVE-01).
- `e2e/harness/p3-live-02-smoke.ts` (new): copy of `p3-live-01-smoke.ts` with: evidence dir →
  `validation/p3-live-02-evidence/` (created, currently empty — no run produced a receive WAV), CDP
  port 9335 (distinct from P3-LIVE-01's 9333), `loadRemoteVirtualMic`/`unloadRemoteVirtualMic`
  wired around the existing `setRemoteDefaultSource` call in both setup and the `finally` teardown
  (module unloaded + default-source restored to the plain monitor regardless of outcome), a 6s
  `onLive` dwell (needed once receive-side capture is fixed — a script-less smoke stops recording
  immediately after publish-validation otherwise, giving the hook no time to see anything).
- `decisions/2026-07-10-p3-live-02-invalid-no-pc.md` (new): full writeup of the Xvfb-disproof, the
  module-remap-source fix, and the newly discovered INVALID_NO_PC blocker with reproduction detail.
- `phase3-counter.md`: row 2 added.

## No app code touched

`git status` shows this batch's diff confined to `e2e/harness/` (`remote-cdp-host.ts`,
`p3-live-02-smoke.ts`) + `plan/` docs. `frontend/`, `backend/` untouched — confirmed via `git status`
before commit.

## Evidence / proof of the audioinput fix

Isolated with a throwaway diagnostic script (run against real .123, deleted after use, tree left
clean before proceeding — verified via `git status e2e/harness/` showing nothing extra):
- Headless, unmodified: `enumerateDevices()` → 0 audioinput; `getUserMedia({audio:true})` →
  `NotFoundError: Requested device not found`.
- Xvfb+non-headless, unmodified: **identical** — 0 audioinput, same `NotFoundError`. Verbose Chrome
  audio-manager log: `DeviceEnum::GetAudioInputDeviceDescriptions => (Found 0 devices, ...)`, inside
  the PulseAudio backend, headless flag not implicated.
- `pactl list sources` on .123: 2 sources exist — the PipeWire monitor (`device.class=monitor`) and
  one real ALSA input whose ports are all hardware-jack `not available`. Neither surfaces to Chrome.
- After `pactl load-module module-remap-source master=<monitor> source_name=virtual_mic
  source_properties=device.description=VirtualMic` + `pactl set-default-source virtual_mic`:
  headless Chrome → `enumerateDevices()` lists `Default` + `VirtualMic` audioinput,
  `getUserMedia({audio:true})` → `{ok:true}`. Re-confirmed under Xvfb+non-headless too (identical
  pass) — proving Xvfb was never the variable.
- Diagnostic state fully unwound before implementing: `pactl unload-module`, `pactl
  set-default-source` restored to the plain monitor, scratch chrome logs/profiles/`.ts` files
  deleted.

## Evidence / proof of the INVALID_NO_PC blocker (not fixed, documented)

- Server log (`logs/meet-poc-be-out.log`) around each test room: `[ws-recv] type=sfu-publish` for
  both bot-140 and bot-123, confirming both legs really published.
- `page1.evaluate` mid-call (documentLoadCount via `getDocumentLoadCount(page1)` from
  `receive-side-recorder.ts`, exported and used only for this diagnostic — not left in the shipped
  script): `documentLoadCount: 1` (no reload false-positive), `__b08s2ReceiveCapture.installed:
  true`, `.pcCount: 0`.
- Directly re-read `window.RTCPeerConnection` mid-call: native (`[native code]`), not the hook's
  wrapper — the override was reverted sometime after hook-install. Manual `new
  window.RTCPeerConnection({})` at that point works but does not increment the hook's counter.
- Full narrative + suspects (zone.js's `RTCPeerConnection` monkey-patch is the lead):
  `decisions/2026-07-10-p3-live-02-invalid-no-pc.md`.

## Calls / cleanup

- 5 smoke attempts, all `acceptanceAttempt:false`, all `purpose:"smoke"`. `callBurnCount` unchanged
  at 0 (`ledger-state.json`) — none counted against the 25-cap.
- 5 rooms created (`f9c4b6a2517b`, `0543c4da1119`, `373f20cc9097`, `255b17eaee2e`, `17d7fe90d40f`),
  all individually verified `canDelete()==true` (harness-registered, not `TEST_ROOM01`/`652c1475`)
  and DELETEd via the harness API (HTTP 200 each) — `joinDualBrowserCallSplitHost`'s own cleanup
  path doesn't run on this error (see decision doc), so these were cleaned up manually, inline.
- Remote (.123) fully restored: no leftover chrome/Xvfb process, `module-remap-source` unloaded,
  `pactl get-default-source` back to the original monitor. No leftover local SSH tunnels.
- `free -h` checked before every launch (2Gi floor); avail stayed ≥24Gi throughout.

## Tests run

- `npx tsc --noEmit` (e2e project config): clean on `remote-cdp-host.ts` and `p3-live-02-smoke.ts`
  (0 new errors attributable to these files).
- No unit tests added — this batch is a harness/env integration fix, not new pure logic; the
  existing `remote-cdp-host.ts` has no unit-test file (matches P3-LIVE-01's precedent — it's
  SSH/process glue, exercised live).
