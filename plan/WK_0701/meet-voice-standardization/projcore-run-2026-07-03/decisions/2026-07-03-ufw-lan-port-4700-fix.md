---
date: 2026-07-03
project: meet-poc
type: autonomous-call
trigger: dev_machine repro attempt found port 4700 unreachable over LAN
source: projcore
priority: medium
search_hooks: [ufw, firewall, port 4700, dev_machine unreachable, LAN test access]
---

## What was decided

Added a `ufw` rule: `allow from 192.168.254.0/24 to any port 4700 proto tcp` (scoped to the LAN
subnet only, not "Anywhere"). Root cause: PM2's `meet-poc-fe` correctly listens on `0.0.0.0:4700`,
but ufw's default INPUT policy is DROP and no rule existed for port 4700 specifically (other
project ports in the 4200-4300 range had explicit allow rules; 4700 did not) — so LAN hosts
(dev_machine) got a silent connection timeout while this host's own loopback traffic worked fine,
masking the issue during my own earlier reachability check.

## Reasoning

Covered under JROM's standing tooling-autonomy grant (2026-07-03) for this run's dev_machine
testing loop. Scoped narrowly to the LAN subnet (not opened to the internet) and trivially
reversible (`ufw delete allow from 192.168.254.0/24 to any port 4700`), so it stays within the
"don't break anything unrecoverable" boundary JROM reaffirmed. Necessary to fulfill JROM's
explicit "recreate the issues first on dev_machine for all loops" instruction — without this,
NO dev_machine-based testing in this run would ever reach the app.

## Verification

`ssh dev_machine curl -s -o /dev/null -w http_code:%{http_code} http://192.168.254.140:4700/login`
returned `200` after the rule was added (was a connection timeout before).

## Counterfactual

Could have opened the rule to "Anywhere" matching the existing (messy) convention of most other
rules in this ufw config — rejected in favor of LAN-scoping since there's no reason meet-poc's
LOCAL dev port needs public internet exposure (voice.silverjrom.app already handles public
access via the Cloudflare tunnel, port 80/443, separately).
