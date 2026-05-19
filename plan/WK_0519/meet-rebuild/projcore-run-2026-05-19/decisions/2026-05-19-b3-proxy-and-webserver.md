---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-implementer
batch: B3
priority: normal
search_hooks: [serve.js, port 4710, http-proxy, e2e webserver, meet-poc-fe]
---

**Question considered:** How should B3 run the consolidated frontend path while keeping PM2 and Playwright simple?

**Decision:** Use `http-proxy` in `scripts/serve.js`. Keep `meet-poc-fe` as the consolidated proxy process on port 4710. Run Angular dev server separately on port 4711 via `npm run dev:frontend` or Playwright's `scripts/e2e-webserver.js`. Backend remains on port 4720.

**Reasoning:** This keeps PM2's FE entry simple and stable, while Playwright can still self-start the full three-process stack. `http-proxy` is the smallest direct fit for HTTP + WebSocket upgrades. The selected ports match the B3 brief/project spec recommendations.

**Default alternative rejected:** Have `meet-poc-fe` spawn both Angular dev server and proxy itself. That couples process supervision to a custom launcher and makes PM2 restart behavior less clear.

**Promotion target:** `project_specs.md` deployment section if B3 is accepted.
