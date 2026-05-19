# Decision: v2-B3 Live Playwright Config for Final UI Validation

## Decision

Run the B3 Playwright suite with `playwright.live.config.ts` against the already-running PM2 stack for final validation.

## Rationale

The default e2e webserver path attempted to start a backend on port 4720 while the PM2 live backend was already bound there. B3 is a frontend shell batch, and the live PM2 stack is the same target that had to be rebuilt and restarted for `voice.silverjrom.app`.

## Consequences

- B3 tests validate the deployed local stack used by the Cloudflare tunnel.
- The port-collision false failure is avoided.
- Future batches can still use the default e2e webserver when the PM2 stack is stopped or the ports are free.
