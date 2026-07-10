# P3-LIVE-02 PROPOSED plan

## Root cause found (overturns the brief's Xvfb hypothesis)

Empirically isolated with a throwaway diagnostic (deleted, tree clean) launched against real .123
over CDP, `context.grantPermissions(['microphone','camera'])` + `getUserMedia({audio:true})`:

- **Headless Chrome, unmodified** (P3-LIVE-01 config): `enumerateDevices()` → 0 audioinput,
  `getUserMedia({audio:true})` → `NotFoundError: Requested device not found`.
- **Xvfb :99 + non-headless Chrome, same PipeWire routing**: **identical result** — 0 audioinput,
  same `NotFoundError`. Chrome's verbose audio-manager log confirms the miss happens at
  `DeviceEnum::GetAudioInputDeviceDescriptions => (Found 0 devices)`, inside the PulseAudio backend
  itself, before any renderer/compositor code runs — headless vs windowed is not the variable.

`pactl list sources` on .123 shows exactly two sources: the PipeWire monitor-of-sink
(`alsa_output...iec958-stereo.monitor`, `device.class=monitor`) used as the "virtual mic" route,
and one real ALSA input (`alsa_input...analog-stereo`) whose mic/line-in ports are all hardware-jack
`not available` (no physical mic wired to this box). **Chrome's PulseAudio input enumeration does
not surface either**: monitor-class sources are excluded from mic enumeration by design (privacy —
a website must not silently capture system audio via the mic permission), and the jack-unavailable
real input never surfaces either.

## Fix (proven, both headless and non-headless)

```
pactl load-module module-remap-source \
  master=alsa_output.pci-0000_2d_00.4.iec958-stereo.monitor \
  source_name=virtual_mic source_properties=device.description=VirtualMic
pactl set-default-source virtual_mic
```

`module-remap-source` creates a **new** source that wraps the monitor but is *not* itself
`device.class=monitor` (it reports `device.class=filter`, `Monitor of Sink: n/a`) — Chrome's filter
no longer excludes it. Re-tested both ways after this: **headless** Chrome → `enumerateDevices()`
lists 2 audioinput (`Default`, `VirtualMic`), `getUserMedia({audio:true})` → `{ok:true}`. **Xvfb +
non-headless** → identical pass. Xvfb is therefore unnecessary — recommend staying headless (matches
P3-LIVE-01's existing `launchRemoteChrome`, smaller diff, no extra process/cleanup surface).

Diagnostic state was fully unwound: module unloaded, default-source restored to the plain monitor,
scratch chrome logs/profiles removed, scratch `.ts` files deleted — `git status` on `e2e/harness/`
shows nothing from this investigation.

## Proposed code change (harness/env only, no app code)

1. `e2e/harness/remote-cdp-host.ts`: add `loadRemoteVirtualMic(config, sourceName)` /
   `unloadRemoteVirtualMic(config, moduleId)` — thin `pactl load-module module-remap-source` /
   `unload-module` wrappers, called around the existing `setRemoteDefaultSource` step. No change to
   `launchRemoteChrome` (stays `--headless=new`, byte-identical launch args to P3-LIVE-01).
2. New `e2e/harness/p3-live-02-smoke.ts`, copied from `p3-live-01-smoke.ts` with: evidence dir →
   `validation/p3-live-02-evidence/`, CDP port 9335 (avoid collision with a live P3-LIVE-01 rerun),
   remap-source load/unload wired into the setup/teardown around the existing
   `setRemoteDefaultSource`/speech-loop calls. Same `joinDualBrowserCallSplitHost` call,
   `acceptanceAttempt: false` (smoke, no cap burn), same cleanup (delete room if `canDelete`, kill
   remote chrome, close tunnel) plus the new module unload.
3. Run it: expect both legs publish (bytesSent > 0) and receive-side WAV has voiced energy from
   bot-123's real mic path (PipeWire virtual_mic ← loopback speech WAV, same as P3-LIVE-01's
   `startRemoteSpeechLoop`, unchanged).

## Risk / scope check

- No app code touched (frontend/backend untouched) — harness + one remote PipeWire module, unloaded
  in the `finally` cleanup path alongside the existing remote-chrome-kill / tunnel-close.
- `free -h` on .140 checked before this proposal: avail 29Gi (>2Gi floor) — proceed.
- Not a downgrade to fake-device — speaker2 is still real-virtual-mic on .123, same topology the
  contract requires; only the PipeWire source-routing step changed.

Awaiting APPROVED-PLAN before implementing + running the smoke.
