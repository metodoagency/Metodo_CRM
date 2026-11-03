import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: 'tests/e2e', workers: 1, timeout: 45000, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) } },
  // Start direct child processes so Playwright can terminate them on Windows.
  // Starting through npm/concurrently leaves grandchildren holding output pipes.
  webServer: [
    { command: 'node --import tsx server/index.ts', url: 'http://localhost:3000/healthz', reuseExistingServer: false, timeout: 60000 },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort', url: 'http://localhost:5173', reuseExistingServer: false, timeout: 60000 },
  ],
  projects: [{ name: 'chromium', testMatch: '**/core.spec.ts' }, { name: 'a11y', testMatch: '**/a11y.spec.ts' }],
});
