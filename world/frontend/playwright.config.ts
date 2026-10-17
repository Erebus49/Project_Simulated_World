import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', timeout: 90000, expect: { timeout: 8000 }, workers: 1,
  use: { baseURL: process.env.TOWN_TEST_URL || 'http://127.0.0.1:8000', browserName: 'chromium', channel: 'chrome',
    headless: true, viewport: { width: 1440, height: 1000 }, launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    screenshot: 'only-on-failure', trace: 'off' },
});
