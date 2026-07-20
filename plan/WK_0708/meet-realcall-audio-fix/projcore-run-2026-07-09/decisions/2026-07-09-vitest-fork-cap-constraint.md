---
name: 2026-07-09-vitest-fork-cap-constraint
description: HARD CONSTRAINT - maxForks 3 cap in e2e/vitest.config.ts is non-negotiable
metadata:
  type: project
  date: 2026-07-09T09:42:00+08:00
  source: projcore (OPS ADVISORY)
  priority: high
---

# ⚠️ HARD CONSTRAINT — vitest Fork Cap

**This is a machine-breaking constraint. Do NOT raise the cap without explicit OPS approval.**

## The incident (2026-07-09 09:38–09:42 UTC)

- **Cause:** e2e/vitest.config.ts had no fork pool config → defaulted to `maxForks = 15` (availableParallelism - 1 on 16-core box)
- **Impact:** 15 forks × 3.5GB each = 37.9GB memory (93% of available) → machine-wide OOM → kernel killed user@1000.service → all tmux sessions died
- **Result:** projcore run crashed, B04-real validator r4 interrupted

## The fix (already applied)

```ts
// e2e/vitest.config.ts
pool: 'forks',
poolOptions: {
  forks: { minForks: 1, maxForks: 3 },  // ← NON-NEGOTIABLE
},
```

**minForks: 1 is mandatory** (vitest 2.x requires minForks ≥ 1 to avoid RangeError on collection).

## Rules (HARD CONSTRAINTS)

1. **Do NOT raise or remove maxForks: 3** in e2e/vitest.config.ts
2. **Do NOT override from CLI** (--maxWorkers, --pool, --no-file-parallelism tricks are forbidden)
3. **Do NOT run harness/__tests__ and Playwright specs concurrently** (both spawn Chromium)
4. **Do NOT change backend pool settings** (already capped at fileParallelism: false)
5. If more parallelism needed: raise ONE fork at a time, watch `free -h`, measure per-fork RSS

## Memory budget

- Each vitest fork peaks at ~3.3–3.5 GB when running browser tests
- 3 forks × 3.5GB = 10.5 GB (safe on 61GB + 8GB swap system)
- 5 forks × 3.5GB = 17.5 GB (margin shrinks; watch memory)
- 6+ forks → approaching yellow zone; OPS review required

## Enforcement

- Before running ANY vitest command in meet-poc, confirm maxForks: 3 is in e2e/vitest.config.ts
- projcore will log memory before/after each test batch
- If peak RSS > 50GB at any point, stop and escalate to JROM/OPS

## Also capped elsewhere

HRIS/worker/vitest.config.ts has the same fork pool issue + 263 test files → capped at maxForks: 4 (not 3 because that repo is huge; still below yellow zone).

---

**Do not break the machine. The cap stays.**
