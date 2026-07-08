# Machine Availability And Test Topology

## Current Availability

Checked on 2026-07-01 around 05:13 UTC.

### JROM Local

- Repo: `/home/agjrom/websites/meet-poc`
- Live/dev URL: `https://voice.silverjrom.app`
- Local app path is available.
- Local CLIs present:
  - `codex`
  - `claude`
  - `grok`
  - `tmux`
  - `node`
  - `npx`
- Local `grok models` returned:
  - `grok-build`
  - `grok-composer-2.5-fast`
  - `glm5.2`

### Peer2 Machine

- Relay token exists in `.env` as `PEER2_MACHINE` (do not print it).
- Relay endpoint used by existing harness: `https://johnnyone.peer2-353.workers.dev/graphql`
- Known Peer2 session id from existing harness: `872d483d-d986-4a3d-9486-eb59a600a55d`
- Fresh availability ping succeeded:
  - Marker: `PEER2_AVAIL_OK_1782882817376`
  - Reply time: `2026-07-01 05:13:51 UTC`
- Existing scripts:
  - `e2e/scripts/peer2-remote-join.mjs`
  - `e2e/scripts/longrun-orchestrator.mjs`
  - `e2e/scripts/agent-client-660.mjs`

### Dev Machine

Correct doc path:

`/home/agjrom/websites/local_dev/dev_machine.md`

The originally requested `/local_dev/dev_machine.md` path does not exist on this host.

Facts from the doc:

- Dev machine IP: `192.168.254.123`
- This host: `192.168.254.140`
- Gateway: `http://192.168.254.123:8787`
- Wake command:

```bash
python3 /home/agjrom/websites/local_dev/wake-123.py
```

Status checked:

- Initially offline.
- Wake-on-LAN packet was sent.
- Gateway came up and returned healthy:
  - `{"status":"ok","service":"agent-gateway","port":8787,...}`
- `/agents` returned implemented agents:
  - `grok`
  - `claude`
  - `codex`
  - `llamacpp`
  - `kloo`
- `codex` session was verified and replied:
  - `DEV_MACHINE_CODEX_OK`
- `grok-composer-2.5-fast` session launched but did not respond within 60 seconds; gateway then showed `agent_running:false`. Treat Grok Composer on dev_machine as degraded until revalidated.

### Silverjrom SG Agent

Doc path:

`/home/agjrom/websites/local_dev/silverjrom_agent.md`

Verified SSH target:

```bash
ssh silverjrom@silverjrom.com
```

Status checked 2026-07-05T23:36:08Z:

- SSH reachable from this host as `silverjrom@silverjrom.com`.
- Remote hostname: `mail.silverjrom.com`.
- Remote OS: Debian 12 bookworm.
- `tmux` installed and verified: `tmux 3.3a`.
- Grok installed and verified: `/home/silverjrom/.local/bin/grok`, version `0.2.87`.
- Verified Grok models:
  - `grok-composer-2.5-fast`
  - `grok-build`
- Headless Grok probes returned `SG_GROK_COMPOSER_OK` and `SG_GROK_BUILD_OK`.
- Grok-in-tmux probes returned `SG_TMUX_COMPOSER_OK` and `SG_TMUX_BUILD_OK`.
- From SG, `https://voice.silverjrom.app/login` returned HTTP `200`.
- Minimal browser automation is installed and verified:
  - Browser binary: `/usr/bin/chromium-headless-shell`
  - Node automation package: `/home/silverjrom/meet-poc-test-client/node_modules/playwright-core`
  - Full `chromium` desktop package was removed after it crashed in headless mode.
  - Xvfb and Playwright-managed browser downloads were not installed.
  - Post-cleanup smoke returned `SG_BROWSER_POST_CLEAN_OK`, HTTP `200`, title `VoiceLokal`, and fake mic label `Fake Default Audio Input`.
  - Final footprint after cleanup: `/home/silverjrom/meet-poc-test-client` 13 MB, `/home/silverjrom/.npm` 19 MB, apt archive cache 24 KB, root filesystem about 11 GB free.

Current verdict: usable now for SSH-driven Grok Composer/Build work, remote network checks, and headless browser-based meet-poc validation with fake microphone input.

## Required Shutdown

After remote validation is finished, shut down dev_machine so it does not waste power:

```bash
ssh silverjrom@192.168.254.123 'sudo nohup poweroff >/dev/null 2>&1 &'
```

Only skip shutdown if JROM explicitly asks to keep it online.

## Test Order

1. JROM local only.
2. Peer2 machine joins after local sandbox proof.
3. Optional 3-way: JROM local + Peer2 + dev_machine.
4. Shut down dev_machine.

## Remote Agent Selection

- Prefer local/JROM machine for coordination.
- Use Peer2 machine only for real remote-user reproduction.
- Use dev_machine Codex for third endpoint automation unless Grok Composer is revalidated.
- Use the Silverjrom SG agent as an outside-PH Grok endpoint through `ssh silverjrom@silverjrom.com`; for browser validation launch Playwright with `/usr/bin/chromium-headless-shell` and the local `playwright-core` install under `/home/silverjrom/meet-poc-test-client`.
- If Grok Composer is needed on dev_machine, run a fresh gateway availability check before relying on it.
