# DR-43 Changes

## User Report

"Goal: a stuck call self-documents WHERE it jams. Extend diagnostics (capture/persist/display ONLY) with candidate-pair detail, gathering/relay-per-side, ICE restart audit fields, signaling/negotiation/glare, bounded transition timeline, WS health, disconnect cycle log; full JSON persisted, compact display + Download JSON."

## Root Cause

The diagnostics payload already captured coarse current state and audio evidence, but not the mechanism-level history needed to separate ICE, signaling-channel, and negotiation failures. A stuck call could show "disconnected" without the selected pair, relay gathering, negotiation/glare, restart audit, or WS reconnect context that explains where it jammed.

## Implementation

- `frontend/src/app/services/webrtc.service.ts`: added bounded per-peer forensics with selected candidate-pair detail from existing `getStats()` reads, relay-gathered-per-side tracking from ICE candidates/stats, nominated-pair changes, ICE restart audit fields, negotiation/glare counters, and a capped transition timeline for connection/ICE/signaling/gathering/pair/restart events.
- `frontend/src/app/services/ws.service.ts`: added WS health snapshot with status, disconnect count, reconnect attempts, last disconnect/reconnect timestamps, and a capped disconnect-to-reconnect cycle log.
- `frontend/src/app/services/meeting-sessions.service.ts`: typed the new forensic JSON fields on diagnostics payloads and peer samples.
- `frontend/src/app/pages/room/room.page.ts`: included `wsHealth` in the existing diagnostics payload builder. Posting cadence and event throttling are unchanged.
- `frontend/src/app/pages/diagnostics/diagnostics.page.*`: added compact display for WS health, selected pair/relay/pair-count, ICE restart audit, negotiation/glare, and latest timeline events. Full detail remains available through Download JSON.
- `backend/src/modules/sessions/store.ts`: kept full payload persistence unchanged and expanded the summary candidate/relay extraction to read candidate-pair local/remote types.
- `e2e/tests/v3-dr41-diagnostics/dr41-diagnostics.spec.ts`: extended the existing two-peer diagnostics test to assert DR-43 forensic fields and capture `screenshots/diagnostics-forensics.png`.

## Guardrails

- Timelines are capped at 40 entries per peer; WS reconnect cycles are capped at 12 entries.
- No per-frame/high-frequency polling was added. Candidate-pair detail is refreshed from the existing quality stats interval and from state-change candidate lookups.
- No DR-40 recovery behavior was added. `autoRecoveryOutcome` is present and remains `null`.

## Autonomous Decisions

None.
