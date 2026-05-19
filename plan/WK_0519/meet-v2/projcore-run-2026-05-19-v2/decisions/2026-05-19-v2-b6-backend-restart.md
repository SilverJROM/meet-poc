# Decision: B6 Backend Restart

## Context

The B6 prompt explicitly called for rebuilding and restarting `meet-poc-fe`, but B6 also changed backend WebSocket protocol handling by adding admitted-only `media-state` relay and host metadata.

## Decision

Restart both PM2 processes:

- `meet-poc-be`
- `meet-poc-fe`

## Rationale

Restarting only the frontend would leave the live backend without the new relay and metadata contract. The backend restart is required for live `voice.silverjrom.app` verification to represent the committed code.

## Consequences

Both processes were confirmed online after restart. No sudo or tunnel config edit was required.
