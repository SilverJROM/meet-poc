# Voice SFU Self-Heal Tasklist

Created: 2026-07-01

## User Report

JROM reported two recent calls where users could not hear each other:

- `JROMRoom` call with Peer2.
- `HRIS_TOJ` group call at `https://voice.silverjrom.app/join/hris-toj`, which had to move to Google Meet.

JROM asked whether this is a code problem, Cloudflare problem, or an app self-healing failure, and asked for a sandbox reproduction before fixing.

## Current Diagnosis

This is not primarily a room admission or basic microphone-selection failure.

The backend admitted users and WebSockets stayed live, but SFU media subscriptions did not converge. Browsers saw remote tracks advertised but were not actually subscribed, or subscriptions existed with unusable audio counters.

Most likely root class:

**App resilience gap around Cloudflare SFU track/session errors and stalled subscriptions.**

Cloudflare may return or trigger the immediate error, but the app currently allows a broken-but-connected call state instead of forcing subscribe retry, renegotiation, SFU rejoin, or clear user-facing recovery.

## Evidence From Recent Calls

### Call 1: JROMRoom With Peer2

Session:

- Room title: `JROMRoom`
- Room id: `4c495f256f63`
- Session id: `2a4dc883-ffe0-4b2a-9275-461ff9e97ed1`
- Time: `2026-06-30 02:34:41-02:49:10 UTC`
- Participants: `JROM`, `peer2`

Observed issues:

- Both clients joined and stayed WebSocket-connected.
- Both clients published to SFU.
- Peer2 initially subscribed to JROM and had inbound media.
- At `2026-06-30 02:48:04 UTC`, Peer2 flipped from `JROM:subscribed` to `JROM:advertised-not-subscribed`.
- After that, Peer2 had `inboundTracks: 0`; he was no longer receiving JROM media.
- Peer2's connection quality degraded to `poor` near the end.
- JROM stayed subscribed to Peer2 longer, but inbound audio had high concealed samples and low/zero audio level in multiple samples.
- Both sides had `/api/sfu/tracks` `406` errors recorded during the call.

Interpretation:

- The app did not fully heal after Peer2 lost the JROM subscription.
- The call looked connected, but at least one direction stopped receiving usable audio.

### Call 2: HRIS_TOJ Group Call

Session:

- URL used: `https://voice.silverjrom.app/join/hris-toj`
- Room title: `HRIS_TOJ`
- Room id: `11215094570c`
- Session id: `7da03683-8908-42ba-b98e-e6f5c9740158`
- Time: `2026-06-30 23:48:30-2026-07-01 00:04:16 UTC`
- Participants: `JROM`, `Roma Ruelo`, `Mira Bautista`, `Glory Demegillo`, `Joanne`

Observed issues:

- Backend room flow worked: join, knock, admit, ping, leave, and close-room were logged.
- Participants were admitted; `admitted_peak` was `5`.
- Main failure was SFU subscription failure across participants.
- Most clients saw peers as `advertised-not-subscribed`.
- Glory's client was worst:
  - `hasPc: false`
  - no SFU connection state
  - no publish status
  - no outbound audio level
  - all peers `advertised-not-subscribed`
- Joanne had `/api/sfu/tracks: 406 OK` errors and never subscribed to others.
- Mira and Roma published but mostly did not subscribe to JROM or others.
- JROM subscribed to some users, but inbound audio was not healthy:
  - very low packet counts in places
  - `audioLevel: 0`
  - huge `concealedSamples`

Interpretation:

- The app admitted the meeting, but the SFU media graph did not form.
- App self-healing did not convert advertised tracks into reliable remote audio.

## Important Observability Problem

Some `/api/sfu/tracks` failures are being stored in diagnostics as `lastGumError`.

That is misleading. These are not getUserMedia/mic permission failures. They are SFU/API track failures.

Future diagnostics should separate:

- local device/media acquisition errors
- SFU publish errors
- SFU subscribe errors
- remote audio playout errors
- silent/stalled RTP stats

## North Star

The app must not leave users in a "connected but cannot hear each other" state.

For every admitted participant with advertised remote audio:

1. The client must either subscribe and receive usable remote audio, or
2. The client must self-heal by retrying, renegotiating, or rejoining the SFU path, or
3. The UI must clearly report unrecovered audio failure and offer an actionable recovery.

Silent failure is not acceptable.

## Proposed Requirements

These are draft requirements for a projcore/Claude run. Number them in `og-requirements.md` if converting into a formal run.

### R1: Fault-Injection Reproduction

Create a local sandbox path that can reproduce SFU track subscription failures without waiting for Cloudflare to fail in real time.

Acceptance:

- A local/dev test can force `/api/sfu/tracks` to return `406` for a selected participant or selected request.
- A local/dev test can simulate a remote track that is advertised but never becomes subscribed.
- A local/dev test can simulate a subscribed inbound audio track with no usable audio progress.
- The current broken behavior is reproduced before implementation work is accepted.

### R2: Subscribe Failure Self-Healing

When `/api/sfu/tracks` fails or a remote track remains `advertised-not-subscribed`, the app must recover.

Acceptance:

- Retried subscription attempts are bounded and observable.
- Retry does not permanently stop while a user remains admitted and the publisher still advertises audio.
- Recovery can escalate from retry to renegotiation to SFU rejoin when lower-cost recovery fails.
- Diagnostics record each recovery step and outcome.

### R3: Stalled Remote Audio Detection

When a client appears subscribed but receives no usable audio, the app must detect this.

Acceptance:

- The app distinguishes healthy silence from broken inbound audio where packets/bytes/energy/emitted samples are stalled or concealed.
- Stalled audio triggers recovery, not just a diagnostics row.
- The recovery is per-publisher where possible and does not destroy unrelated healthy streams.

### R4: Publish Failure Recovery

If an admitted user has no SFU PeerConnection or failed publish state (`hasPc:false`, `publishStatus:null/error`) after joining, the app must recover.

Acceptance:

- The app identifies the state as media-not-published.
- It retries publish or rejoins SFU without requiring the user to leave the room manually.
- If unrecoverable, the UI tells the user exactly what failed.

### R5: Diagnostics Honesty

Diagnostics must identify the failing layer correctly.

Acceptance:

- `/api/sfu/tracks` failures are not recorded as `lastGumError`.
- Diagnostics include separate fields for device, publish, subscribe, recovery, playout, and remote inbound stats.
- Diagnostics page or payload makes `advertised-not-subscribed` obvious and actionable.

### R6: Multi-Participant Regression Coverage

The fix must cover more than a 2-person call.

Acceptance:

- Local tests cover 2-person and 5-person subscription graphs.
- Real-machine validation covers JROM + Peer2.
- Optional 3-way validation covers JROM + Peer2 + dev_machine before final handoff when feasible.

## Validation Order

JROM specifically requested faster validation first.

Use this order:

1. **JROM local only**
   - Use local unit/integration/Playwright or fault injection.
   - Reproduce the failure shape.
   - Confirm the recovery behavior.

2. **Peer2 machine**
   - After local proof, use Peer2's machine to join and recreate the real remote scenario.
   - Capture diagnostics before/during/after.

3. **Optional 3-way**
   - JROM local + Peer2 machine + dev_machine.
   - Use dev_machine Codex unless Grok Composer is revalidated.

4. **Shutdown dev_machine**
   - Required command:

```bash
ssh silverjrom@192.168.254.123 'sudo nohup poweroff >/dev/null 2>&1 &'
```

## Suggested Atomic Batches

### B0: Lock Requirements And Plan

Create:

- `og-requirements.md`
- `implementation-plan.md`
- `north-star.md`
- `queue.md`
- `req-matrix.md`

Include this handoff as source evidence.

### B1: Local Reproduction Harness

Build fault injection for:

- `/api/sfu/tracks` `406`
- advertised-but-not-subscribed remote tracks
- subscribed-but-no-usable-audio stats

Expected output:

- failing tests that demonstrate current non-healing behavior.

### B2: Subscribe Recovery

Implement bounded recovery for subscribe failures and advertised-not-subscribed state.

Expected output:

- tests pass for forced `/api/sfu/tracks` failure.
- diagnostics prove retry/renegotiate/rejoin path.

### B3: Stalled Audio Recovery

Implement detection and recovery for subscribed-but-silent/stalled remote audio.

Expected output:

- tests pass for stalled inbound audio.
- recovery does not clobber unrelated healthy remote streams.

### B4: Publish/PC Recovery

Handle admitted client with `hasPc:false` or publish not established.

Expected output:

- local test reproduces a Glory-like client state.
- app recovers or surfaces explicit unrecovered failure.

### B5: Diagnostics Cleanup

Separate device/media acquisition errors from SFU/API failures.

Expected output:

- `/api/sfu/tracks` `406` no longer appears as `lastGumError`.
- diagnostics report the actual failing layer.

### B6: Local Multi-Participant Capstone

Run local multi-user/fault-injection scenarios.

Expected output:

- 2-person scenario passes.
- 5-person scenario passes.
- evidence includes diagnostics rows proving remote audio subscriptions and recovery.

### B7: Peer2 Machine Validation

Use Peer2's machine to recreate the real remote call after local proof.

Expected output:

- Peer2 joins.
- If a failure is injected or naturally occurs, app self-heals.
- If no failure occurs, diagnostics still prove subscribed and receiving usable audio both ways.

### B8: Optional 3-Way Validation

Use JROM local + Peer2 machine + dev_machine.

Expected output:

- all participants subscribed to advertised audio or recover.
- dev_machine is shut down afterward.

## Requested Agent Lineup

JROM requested:

- Coordinator: Codex 5.5
- Co-planner: Opus
- Implementer L1: Grok Composer
- Implementer L2: Spark
- Implementer L3: Sonnet
- Validator: Codex 5.5
- Team pool: Codex 5.5, Sonnet, Opus, Grok Build, Spark

Note:

- Local Grok Composer is available.
- dev_machine Grok Composer was not verified responsive and should not be used there unless revalidated.
- dev_machine Codex was verified responsive.

## Deliberation And Red-Team Recommendation

This work touches realtime media, external SFU dependency behavior, retry state, diagnostics, and multi-participant recovery.

Recommended:

- Use Opus co-planning in B0.
- Use deliberation before implementation if the plan has competing recovery strategies:
  - retry-only
  - forced renegotiation
  - full SFU rejoin
  - hybrid escalation ladder
- Use at least a standard red-team after recovery implementation because stale SFU session state can easily create regressions:
  - duplicate subscriptions
  - ghost remote streams
  - deleting unrelated healthy streams during rollback
  - retry storms
  - silent UI failures

## Known Useful Files

Project/run context:

- `project_specs.md`
- `backend/src/modules/realtime-sfu/index.ts`
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/remote-audio.service.ts`
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts`
- `backend/src/modules/sessions/store.ts`
- `backend/src/modules/sessions/index.ts`

Existing remote harness:

- `e2e/scripts/peer2-remote-join.mjs`
- `e2e/scripts/longrun-orchestrator.mjs`
- `e2e/scripts/agent-client-660.mjs`
- `e2e/scripts/lib/measuring-client-core.mjs`

Remote machine guide:

- `/home/agjrom/websites/local_dev/dev_machine.md`

## Do Not Lose These Decisions

- Do local sandbox reproduction first.
- Do not start by live-testing Peer2 before local proof.
- Use Peer2 machine after local proof.
- Use dev_machine only when needed for 3-way validation.
- Shut down dev_machine after validation.
- Treat `advertised-not-subscribed` as a failure state when it persists after admission.
- Treat `subscribed` with no usable inbound audio as a failure state.
- Do not call `/api/sfu/tracks` failures microphone errors.
