import { defineConfig, devices } from '@playwright/test';

// e2e boots the real API against an isolated, seeded temp DB (FINANCE_DATA_DIR)
// plus the Vite dev server, then drives the app in Chromium (S7.1).
const API_ENV = { FINANCE_DATA_DIR: './.e2e-data', FINANCE_NO_TOAST: '1', PORT: '5275' };

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5273', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run e2e:api',
      url: 'http://127.0.0.1:5275/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: API_ENV,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5273',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
