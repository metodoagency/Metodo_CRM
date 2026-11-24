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
  projects: [
    { name: 'chromium', testMatch: '**/core.spec.ts', grepInvert: /@club-workspace/ },
    { name: 'club-workspace', testMatch: '**/core.spec.ts', grep: /@club-workspace/ },
    { name: 'transfer-workspace', testMatch: '**/transfers.spec.ts' },
    { name: 'contract-workspace', testMatch: '**/contracts.spec.ts' },
    { name: 'agenda-workspace', testMatch: ['**/agenda.spec.ts', '**/tasks.spec.ts'] },
    { name: 'meeting-workspace', testMatch: '**/meetings.spec.ts' },
    { name: 'agenda-layers', testMatch: '**/agenda-layers.spec.ts' },
    { name: 'dashboard-workspace', testMatch: '**/dashboard.spec.ts' },
    { name: 'resource-workspace', testMatch: '**/resources.spec.ts' },
    { name: 'presentation-task-rule', testMatch: '**/presentation-tasks.spec.ts' },
    { name: 'sponsorship-workspace', testMatch: '**/sponsorship.spec.ts' }, { name: 'sponsorship-pipeline', testMatch: ['**/pipeline.spec.ts', '**/membership.spec.ts'] },
    { name: 'a11y', testMatch: '**/a11y.spec.ts' },
  ],
});
