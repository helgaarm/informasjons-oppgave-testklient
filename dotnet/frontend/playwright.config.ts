import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true, forbidOnly: !!process.env.CI, workers: 2,
  timeout: 30000, globalTimeout: 240000, reporter: 'list',
  outputDir: '../../test-results/dotnet-browser',
  use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', trace: 'retain-on-failure' },
});
