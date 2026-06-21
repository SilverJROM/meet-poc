---
type: feature / test-harness
status: in-progress
agent: projcore
qa_verification: measured multi-party audio (WebAudio energy + getStats inbound-rtp) on rendered app, DEV
---

# Remote (cross-world) machine joins our call with measured audio

**JROM verbatim:**
> "i need you to test meet poc or our voice app and while talking to codex on peer2's machine prompt him do dial in and play sounds or talk to join and you check for issues and consult him as well for issues and the goal is peer2's machine can join our call and you can hear him and he can hear you if we can test the vid its good but priority is voice right now. you run this as /projcore and implementer is grok build, validator is codex55, team is sonnet/codex55/spark/haiku, every error deliberate it and red team it fix it retest, rinse and repeat until this is working ... at every 5x loop stop and message me to continue, submit a ticket to ovm as well"

**Handling:** projcore run `plan/WK_0526/meet-remote-audio-e2e/projcore-run-2026-06-19/`. OVM wf=68. Topology 3-agent (grok build / codex55 / Opus). Peer2-codex on creepy-mini joins via JohnnyOne relay. R1–R7 in og-requirements.md. Priority voice; video stretch. 5-cycle TG checkpoint.
