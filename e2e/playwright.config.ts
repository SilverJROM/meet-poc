import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4710';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
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
  webServer: {
    command: 'npm run seed && npm run e2e:webserver',
    cwd: '..',
    url: `${baseURL}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
