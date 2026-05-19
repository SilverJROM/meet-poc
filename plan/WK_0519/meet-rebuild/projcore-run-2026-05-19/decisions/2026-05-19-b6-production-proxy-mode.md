# Decision — B6 Production Proxy Mode

## Status

Accepted

## Decision

Run `meet-poc-fe` with `NODE_ENV=production` at cutover.

## Rationale

`scripts/serve.js` proxies to Angular dev server only when `NODE_ENV` is not `production`. No Angular dev server PM2 process is part of the cutover topology, and the build pipeline produces deployable Angular artifacts. Production mode makes the proxy serve the built `frontend/dist/` files directly.

## Consequences

- `meet-poc-fe` serves static Angular build output on port `4700`.
- Backend proxying still targets `http://localhost:4720`.
