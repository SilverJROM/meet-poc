import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalTeardown: './global-teardown.ts',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4700',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
