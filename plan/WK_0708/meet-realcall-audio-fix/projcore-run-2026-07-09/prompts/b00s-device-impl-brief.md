# B00S-DEVICE — CallDriver device_mode + real-virtual-mic on .123 only

§4b: impl sonnet foundation, val L2, redteam budget. Smoke only (log duration+purpose, do NOT acceptance-burn if <60s).

## North bindings
1. **Remove** `--use-fake-device-for-media-stream` from `DEFAULT_LAUNCH_ARGS` entirely.
2. **`deviceMode` is REQUIRED** on CallDriverConfig / joinDualBrowserCall — **no default**. Type: `'fake-device' | 'real-virtual-mic'`. Any call without it must fail at TypeScript/compile or runtime throw.
3. **`.140` has no audio stack** (no pactl). `real-virtual-mic` is **ONLY valid on .123** (`silverjrom@192.168.254.123`).
4. Topology for hearability:
   - `.123` participant: `deviceMode: 'real-virtual-mic'` — do NOT pass `--use-fake-device`; DO keep `--use-fake-ui-for-media-stream`; set pactl **default-source** to the virtual mic so Chrome selects it.
   - `.140` participant: `deviceMode: 'fake-device'` + **real speech** WAV via `--use-file-for-fake-audio-capture` (bot-speech or alice-host — **not tones**).
5. At least ONE side of every hearability call must be real-virtual-mic, and it must be the **.123** side.
6. Never claim AC2 from fake-device on either end.
7. Validation provenance helper: every validation report / CallResult should record `device_mode` + `stimulus: speech|tone|DC`. Missing = INVALID later (wire helper + types now).

## Implementation sketch
- `CallDriverConfig`: `deviceMode: 'fake-device' | 'real-virtual-mic'` required; optional `stimulus?: 'speech'|'tone'|'DC'`; optional `fakeAudioPath?` for fake-device speech file; optional `peerRole?: 'local-140' | 'remote-123'` for dual asymmetric launch.
- Dual-browser may need **per-page device modes** if one browser is local and one remote:
  - Prefer `deviceModeBySpeaker: { 'bot-140': 'fake-device', 'bot-123': 'real-virtual-mic' }` or launch browser2 on .123 via SSH display — **if remote Chromium on .123 is not feasible this batch**, implement the API + unit tests + a **smoke that runs real-virtual-mic only when `process.env.MEET_REAL_MIC_HOST` / hostname indicates .123**, and document that full dual asymmetric requires test runner on .123 or CDP remote.
  - Minimum acceptable: (a) API required deviceMode, (b) fake-device path uses speech file not bare beep, (c) real-virtual-mic path omits fake-device, sets default-source via pactl when available, (d) smoke test skips with clear message if not on .123, (e) provenance fields on CallResult.

**Prefer:** if tests run from .140, use Playwright to launch only fake-device locally, and SSH a node/playwright worker on .123 for real-mic leg — only if already practical. Else implement local API + .123-gated smoke + docs for B06/AC2 wiring.

## Wire B06
- `WeakSourceControl.applyAttenuation` live path when host is .123 / SSH available (optional stretch if smoke lands).

## Deliverables
1. call-driver.ts changes (required deviceMode, no default fake in DEFAULT_LAUNCH_ARGS)
2. Update **all** call sites that launch chromium for calls/tests to pass explicit deviceMode
3. Provenance type + helper
4. Smoke test(s)
5. changes.md + commit
6. Callback DONE

## Handshake
PROPOSED first → APPROVED-PLAN → work.

Out of scope: B00S-RELOAD, budget rewrite (unless needed for smoke log), AC2 full close.
