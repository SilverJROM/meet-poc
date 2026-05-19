# Decision: v2-B4 Restart Backend for Live API

## Decision

Restart `meet-poc-be` as well as `meet-poc-fe` after the final B4 build.

## Rationale

The B4 brief explicitly called out `pm2 restart meet-poc-fe`, but B4 also changes backend API behavior for rooms, recordings, and meeting sessions. The PM2 backend process does not automatically reload source edits with `watch: false`, so live verification required a backend restart.

## Consequences

- `voice.silverjrom.app` served the updated frontend and API behavior during B4 validation.
- Both PM2 services were confirmed online after restart.
