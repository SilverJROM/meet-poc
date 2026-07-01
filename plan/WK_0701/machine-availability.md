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
- If Grok Composer is needed on dev_machine, run a fresh gateway availability check before relying on it.
