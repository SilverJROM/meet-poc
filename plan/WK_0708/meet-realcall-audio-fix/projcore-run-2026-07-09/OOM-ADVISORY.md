# ⚠ OOM ADVISORY — meet-poc vitest took down the whole machine (2026-07-09 09:41 UTC)

**Read this before running any vitest command in meet-poc.**

## What happened

A machine-wide OOM fired at 09:38–09:42 UTC. The kernel killed PID 351854 — `systemd`,
the **User Manager for UID 1000** — which tore down `user@1000.service`. The tmux server
lived in that cgroup, so **every tmux session died at once** (projcore run included).

No reboot. The box has 61 GB RAM + 8 GB swap. `user@1000.service` peaked at
**56.9 GB memory / 5.5 GB swap** before the kernel intervened.

## Root cause — this repo

`meet-poc/e2e/vitest.config.ts` had **no pool configuration**. Vitest therefore defaulted to
`maxForks = availableParallelism - 1` = **15 forks** on this 16-core box.

`npm test -w e2e` runs `vitest run harness/__tests__` → 17 test files, of which:

- **6 are `*.browser.test.ts`** and each fork calls `chromium.launch()` (Playwright).
- **`bot-speech-whisper-roundtrip.test.ts`** shells out to local whisper via `spawnSync`
  (`--model … --provider local`).

So a single test command fanned out to 15 Node forks, several holding a headless Chrome
and/or a whisper model at once.

Measured at OOM time (RSS, from the kernel's task dump):

| Consumer | RSS | Share |
|---|---|---|
| **12 × `node (vitest N)`** | **37.93 GB** | **93%** |
| claude (8 procs) | 0.80 GB | 2% |
| workerd (3 procs) | 0.33 GB | <1% |
| everything else | < 0.25 GB each | — |
| **total peak RSS** | **40.9 GB / 388 procs** | |

Each fork peaked at ~3.3–3.5 GB. The OOM-killed `chrome-headless` held **51 GB of virtual
address space** and was running *inside a tmux pane scope*.

Ugly detail: the vitest forks all sat at `oom_score_adj = 0` while the session's small
services (`dbus-daemon`, `xdg-document-portal`) carried `200` and the user manager `100`.
The kernel killed the tiny high-score processes, freed nothing, escalated, and eventually
decapitated the user session — **the 3.5 GB forks were never touched.**

## The fix (already applied)

`meet-poc/e2e/vitest.config.ts`:

```ts
pool: 'forks',
poolOptions: {
  forks: { minForks: 1, maxForks: 3 },
},
```

**`minForks: 1` is mandatory.** On vitest 2.x the default `minForks` sits above a low
`maxForks`, and tinypool throws `RangeError: options.minThreads and options.maxThreads
must not conflict` at collection time. Setting only `maxForks` breaks the suite.

Verified with `npx vitest list harness/__tests__` → 147 tests collect clean.

## Rules for this repo

1. **Do not raise or remove the `maxForks: 3` cap** in `e2e/vitest.config.ts`.
2. **Do not override it from the CLI** (`--maxWorkers`, `--pool`, `--no-file-parallelism`
   games). The config is the guardrail.
3. **Do not run the `harness/__tests__` suite and the Playwright specs concurrently** —
   both pull up headless Chrome.
4. `meet-poc/backend` is already safe: it sets `pool: 'forks'` + `fileParallelism: false`,
   so it runs one file at a time. Leave it that way.
5. If you genuinely need more parallelism, raise it **one fork at a time** and watch
   `free -h` — each fork costs ~3.5 GB.

## Also capped elsewhere (same failure mode, not yet triggered)

`HRIS/worker/vitest.config.ts` had no pool config and 263 test files → `minForks: 1,
maxForks: 4`.
