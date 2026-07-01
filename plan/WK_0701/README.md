# WK_0701 Voice SFU Self-Heal Handoff

Created: 2026-07-01

This folder captures the current investigation and execution plan for the voice app SFU self-healing work. It is intentionally written as a handoff so another agent can continue without relying on chat history.

Primary handoff:

- `voice-sfu-self-heal-tasklist.md` - incident summary, requirements, atomic tasklist, validation ladder, and model/team routing.
- `machine-availability.md` - current remote-machine availability, how to use Peer2/dev_machine, and the required shutdown step.

Do not start with a code fix. Start by reproducing the failure locally with fault injection, then prove the recovery behavior, then move to Peer2-machine validation.
