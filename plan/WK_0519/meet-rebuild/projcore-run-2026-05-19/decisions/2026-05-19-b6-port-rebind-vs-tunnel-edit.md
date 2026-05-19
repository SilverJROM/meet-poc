# Decision — B6 Port Rebind Instead of Tunnel Edit

## Status

Accepted

## Decision

Rebind `meet-poc-fe` to local port `4700` instead of editing Cloudflare tunnel configuration.

## Rationale

The active Cloudflare tunnel is token-based and its hostname mapping is managed in Cloudflare Zero Trust, not in a local `~/.cloudflared/config.yml`. The existing public hostname already targets local port `4700`, so replacing the process on that port is the safest local cutover path.

## Consequences

- No Cloudflare config file was edited.
- The legacy `meet-poc` PM2 process was stopped/deleted to free port `4700`.
- `meet-poc-fe` now listens on `4700`.
