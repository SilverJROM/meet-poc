# P3-LIVE-05 PROPOSED plan

## Environment change: minimal, reversible PulseAudio null-sink on .140

Confirmed available: `sudo -n true` succeeds (passwordless sudo), `pulseaudio`/`pulseaudio-utils`
are in the apt cache (not installed), 550G disk free. This IS a machine-level change (new system
packages + a background user-session daemon), bigger than this run's prior harness-only edits —
flagging clearly before running, per the brief's own gate.

**Steps:**
1. `sudo apt-get install -y pulseaudio pulseaudio-utils` — standard Ubuntu packages, fully
   reversible (`apt-get remove`), no config file surprises expected (fresh install, nothing to
   conflict with — confirmed zero pulseaudio/pipewire *server* currently installed, only client
   libs).
2. Start PulseAudio as a **per-user session daemon**, not a systemd system service:
   `pulseaudio --start --exit-idle-time=-1` (under the existing `XDG_RUNTIME_DIR=/run/user/1000`,
   which already has an active D-Bus session — confirmed via `ls /run/user/1000/bus`). Nothing
   system-wide; scoped to this user, killable at any time with no other-user impact.
3. `pactl load-module module-null-sink sink_name=harness_null_sink
   sink_properties=device.description=HarnessNullSink` + `pactl set-default-sink
   harness_null_sink` — gives Chrome's `<audio>` elements a real (if silent-to-nobody) output sink
   to render into, which P3-LIVE-04's finding suggests is the missing piece for
   `captureStream()` to carry real samples on a real WebRTC-track-backed element.
4. **Isolation test first** (per brief item 2, before burning any SFU call): rerun a local-only,
   no-SFU micro-test — this time with a REAL two-PC loopback RTCPeerConnection (not the synthetic
   `MediaStreamDestination` one from P3-LIVE-04, which never depended on a real sink and so
   couldn't have caught this) feeding a `<audio srcObject>` element, `captureStream()` it, confirm
   `maxAbs`/rms > 0 with the null-sink present. If this alone doesn't get real signal, STOP — don't
   burn a live .123 call chasing a hypothesis that's already failed its own isolation test.
5. Only if step 4 passes: re-run the P3-LIVE-04 split-host smoke (`dom-audio-capture.ts` +
   `p3-live-04-smoke.ts`, likely copied to `p3-live-05-smoke.ts` for its own evidence dir) — same
   `module-remap-source` route on .123, DOM capture on .140, now with the null sink present.
   `acceptanceAttempt:false`, evidence → `validation/p3-live-05-evidence/`.
6. Cleanup: unload the null-sink module, keep the PulseAudio **package** installed (harmless,
   standard, and every future P3-LIVE batch would otherwise need to reinstall it) but note whether
   the background daemon should stay running between batches or be stopped — recommending **leave
   it running** (matches how `.123`'s PipeWire session persists across batches already) unless
   told otherwise. Rooms cleaned up inline (`canDelete()` gate, same as prior batches).

## Explicitly NOT doing

- Not moving the receiving browser to `.123` (the P3-LIVE-04 doc's alternative candidate) — that's
  a topology change requiring its own PROPOSED+APPROVED per this brief's item 6, not attempted here.
- Not touching `receive-side-recorder.ts`'s ctor-hook path (still separately broken, not
  re-litigated per this brief's explicit instruction).
- No app/product code changes — `frontend/`/`backend/` untouched.

## Risk

- Installing a system daemon package via sudo is the most invasive step this run has taken so far
  (everything before was either harness TypeScript or `pactl` calls against an *already-installed*
  PipeWire on `.123`). Fully reversible (`apt-get remove pulseaudio pulseaudio-utils`,
  `pulseaudio --kill`), scoped to this user's session, no system service/systemd unit installed.
- If `pulseaudio --start` fails outright in this non-graphical SSH session (some distros require a
  logind session of type != tty for auto-spawn) — that itself is useful evidence either way, will
  report BLOCKED with the exact error rather than working around it with a heavier fix (e.g. a
  systemd system service) without a fresh approval.

Awaiting APPROVED-PLAN before running `apt-get install` and the isolation test.
