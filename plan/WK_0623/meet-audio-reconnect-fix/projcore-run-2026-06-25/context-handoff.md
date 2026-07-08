# Context Handoff

## User Request

Investigate recent call diagnostics where participants/clients had no audio, use `$projcore`, plan with co-planner, implement through an independent implementer, validate independently, red-team the result, then perform a final host-to-Peer2 US machine call proof.

## Initial Diagnostic Finding

- Affected session: likely `1d64437e-96ac-4d79-a527-bcae18d05b31`, room `640edd52a969` / `Luminos`, around `2026-06-25 12:08-12:15 UTC`.
- Remote audio elements were attached/live/unmuted/unblocked/unlocked, so this is not primarily autoplay or speaker mute.
- J's inbound SFU audio from a remote publisher stalled at `1,634 bytes / 46 packets` for roughly one minute.
- After reconnect, a new track received only `8,946 bytes / 252 packets` before reconnect churn.
- The Android/client side had WebSocket disconnects (`1006`) and high packet loss in one sample, but later did receive host audio, so this is not a total SFU outage.
- Diagnostics included `advertised-not-subscribed`, indicating app state knew a publisher existed while subscription was not usable.
- A prior room around `2026-06-25 11:08 UTC` carried bidirectional audio counters normally.

## Working Theory

The failure is a stale or incomplete SFU subscription recovery issue around reconnect/resume rather than a generic playback problem. Current watchdog logic can recover playout when bytes stall, but it does not force the SFU subscription to be torn down and rebuilt after inbound audio bytes stop while the publisher is still advertised.

## Team Lineup

Requested:
- Co-planner: Sonnet
- Implementer: Grok Composer or Spark
- Validator: Sonnet
- Deliberation/red team: Codex, Sonnet, Spark

Runtime availability at run start:
- Sonnet/Claude unavailable from capacity checker: `CLAUDE_CRED not supplied`.
- `claude` CLI exists, but projcore usage checker marks Claude unavailable without credentials.
- Spark/Codex available.
- `grok` CLI exists; usability still needs dispatch validation if selected.

Decision: proceed with available independent roles and record the substitution. If Claude credentials become available mid-run, reintroduce Sonnet for validator/red-team.

## Peer2 Relay

- Relay endpoint and session are configured in repo scripts.
- Peer2 machine node reported online as `creepy-mini`.
- Peer2 relay key is present in `.env` and must not be printed.
- Telegram webhook secret is separate and empty; it does not block relay control.

