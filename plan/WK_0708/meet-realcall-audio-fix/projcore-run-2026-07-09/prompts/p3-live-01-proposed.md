# PROPOSED — P3-LIVE-01: .140↔.123 topology + first live SFU smoke

## Feasibility findings (this session)

- SSH `silverjrom@192.168.254.123` is passwordless/trusted from `.140`. Host: `jromhost`, 31Gi RAM (21Gi avail — healthier than `.140`, which has been swinging as low as 704Mi avail per progress.md logs today).
- `.123` has **no meet-poc checkout**. `~/voicesim` there is unrelated piper/whisper tooling, not this repo.
- `.123` has `pactl 16.1` and Playwright's `chromium-1228` already cached at `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` (same revision also cached on `.140`; local repo pins playwright-core 1.60.0/chromium-1223 — close enough for a CDP connection, which is protocol-level, not revision-pinned).
- `.123 → .140:4700` reachable: `curl` returned `HTTP 200`.
- No PipeWire null-sink/virtual-source module is currently loaded on `.123`. Two sources exist: `alsa_input.pci-...analog-stereo` (physical line-in, SUSPENDED, nothing connected) and `alsa_output.pci-...iec958-stereo.monitor` (monitor of the digital output — this is the practical "virtual mic": whatever plays through that output sink is capturable as mic input).
- `call-driver.ts`'s `assertRealVirtualMicHost()` / `isOnRealMicHost()` gate `real-virtual-mic` on the **calling Node process's own host** (env var or interface), and `setVirtualMicDefaultSource()` runs `pactl` **in-process** via `spawnSync`. That means a single `joinDualBrowserCall` invocation cannot natively run one browser on `.140` and another on `.123` — both browsers it launches share the process's host. This was already flagged as a known gap in `prompts/b00s-device-impl-brief.md`: *"if remote Chromium on .123 is not feasible this batch... document that full dual asymmetric requires test runner on .123 or CDP remote."*

## Topology decision: CDP-remote split-host (not full co-locate)

Two architecturally valid options; recommending **B**:

**A — Co-locate both browsers on `.123`.** Simpler code (no CDP glue), BASE_URL points at `.140:4700`. Rejected for *this* batch: requires bootstrapping the meet-poc repo + `npm ci` (+ possibly Playwright's own browser install, even though a cached chromium exists, it's a bare cache not a full playwright-core meet-poc install) on `.123` from scratch — real risk of blowing the 30min SHORT budget on unknowns (npm registry reachability from `.123`, dependency drift), for a batch whose stated job is topology + one smoke.

**B — CDP-remote (recommended).** Keep the harness/node process, ledger, and all deps on `.140` (already working). For the `.123` leg only:
1. SSH-launch `chrome-linux64/chrome` directly on `.123` (no repo needed there) — `--headless=new --remote-debugging-port=<port bound to 127.0.0.1> --use-fake-ui-for-media-stream` (deliberately *no* `--use-fake-device-for-media-stream`, so it inherits the OS default mic → the virtual-mic route below), background it, capture PID.
2. `ssh -N -L <port>:127.0.0.1:<port> silverjrom@192.168.254.123` local port-forward — CDP is **never** exposed on the LAN, only tunneled over the already-trusted SSH channel.
3. Real-mic routing on `.123` (via ssh, before Chrome opens the mic): `pactl set-default-source alsa_output.pci-0000_2d_00.4.iec958-stereo.monitor`, then `paplay --device=alsa_output.pci-0000_2d_00.4.iec958-stereo <speech.wav>` timed to the call's talk window — Chrome's `getUserMedia` picks up real OS-routed audio (a genuinely real capture path, not a Chrome synthetic flag), matching the "recording is the arbiter" standing rule.
4. Harness glue (new, `e2e/harness/` only, no product scope creep): a small helper to (a) shell out the SSH launch/tunnel/cleanup, (b) `chromium.connectOverCDP('http://127.0.0.1:<port>')` for the `.123` leg's `Page` instead of a local `chromium.launch()`, while `bot-140` still launches locally via the existing `fake-device` path (speech WAV — `.140` has no audio stack, this is the sanctioned asymmetric fallback for the leg that doesn't need OS mic).
5. This literally satisfies ".140↔.123" (one browser process is physically on each machine) and is lighter on `.140`'s memory than option A (one Chrome instance on `.140` instead of two), which matters given today's near-OOM swings.

## First smoke plan (this batch — not the 25-call proof)

- ONE call: `speaker1Name: 'bot-140'` (local, `fake-device`, speech WAV), `speaker2Name: 'bot-123'` (CDP-remote, `real-virtual-mic`, monitor-source routed).
- `acceptanceAttempt: false`, target **<180s** wall time (no cap burn).
- `recordReceiveSide: true` on the `bot-140` page (captures what `.140` received from `.123`'s real-mic-routed audio) — PASS bar: both sides publish (`publishedBytes > 0`) **and** receive-side recording shows energy above noise floor (recording is the arbiter, per north-star — not WebRTC stats alone).
- Cleanup inline: `registerCreatedID` the room, delete after (only the run-created ID — never `652c1475` / `testroom01001`); kill the remote Chrome process and SSH tunnel.
- Log burn/free-h to `phase3-counter.md` row 1 regardless of PASS/FAIL (per template).

## Risk / mitigation

- `.140` memory has swung to <1Gi avail multiple times today. Will check `free -h` immediately before launch; if avail <2Gi, report BLOCKED rather than launch (OOM protection, maxForks unaffected since this is 1 local + 1 remote browser, not 3 forks).
- First-time SSH/CDP wiring is the main schedule risk inside the 30min SHORT box — if CDP connect fails outright (e.g. sandboxing blocks the tunnel), fallback is to at least land the harness glue + document the blocker, not silently downgrade to a fake-device-only "smoke" that wouldn't satisfy the real-virtual-mic requirement.

## What I have NOT done yet (awaiting APPROVED-PLAN)

No product/harness files modified, no remote Chrome launched, no SSH tunnel opened, no call attempted. Everything above is read-only investigation (ssh diagnostics, grep/read of existing code and plan docs).
