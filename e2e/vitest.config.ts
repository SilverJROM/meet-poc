import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      // Each fork can launch its own Chromium (*.browser.test.ts) and shell out to
      // local whisper, so a fork peaks near 3.5 GB. Unbounded, vitest defaults to
      // availableParallelism - 1 (15 here) and exhausts 61 GB of RAM.
      forks: { minForks: 1, maxForks: 3 },
    },
  },
});
