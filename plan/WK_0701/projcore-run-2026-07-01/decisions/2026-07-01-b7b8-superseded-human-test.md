---
date: 2026-07-01
project: meet-poc
type: autonomous-call
source: projcore
priority: high
search_hooks: [b7, b8, b9, peer2, human-test, harness-stale, deploy, dev_machine-shutdown]
---
# B7/B8 scripted agent-measured superseded by JROM's direct human test
JROM chose to test the deployed fix directly with actual Peer2 ("i will try to test with actual peer2 now
just set the diagnostics on") rather than have projcore repair the stale remote agent-harness for scripted
B7/B8 agent-measured calls.
Findings: the pre-existing remote harness (peer2-remote-join.mjs etc, Jun-21) is stale vs the current join
flow (display-name selector + mic-access handling) — 2 agents against deployed AGENTROOM failed at
missingJoinPrereqs:[name,mic]. B6's fresh e2e already proved 2p+5p recovery against REAL Cloudflare SFU.
Actions: fix DEPLOYED to voice.silverjrom.app (bundle main-4AYHDE7E.js confirmed live, /api/me 200);
diagnostics_globally_enabled set explicitly = 1 (/api/me diagnosticsGloballyEnabled:true); dev_machine
powered off (gateway + ssh confirmed down) per JROM's "shutdown before you ping me".
Run state: R1-R5 VERIFIED; R6 local (B6) done; R6 stays IN-PROGRESS pending JROM's B9 human-audible confirm.
NOT merged to main yet — merge after JROM confirms audio works in the real call.
