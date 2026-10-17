import { defineConfig, chromium } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Reuse a locally installed Chromium when the exact Playwright revision is absent.
const cache = join(homedir(), '.cache', 'ms-playwright');
const cachedBrowser = existsSync(cache) ? readdirSync(cache).filter(name => name.startsWith('chromium-')).sort().reverse()
  .map(name => join(cache, name, 'chrome-linux64', 'chrome')).find(existsSync) : undefined;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chromium.executablePath()) ? undefined : cachedBrowser);
const testData = process.env.FOGBOUND_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'fogbound-e2e-'));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8790',
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    launchOptions: { executablePath },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:8790/api/health',
    env: { PORT: '8790', DATA_DIR: testData, LLM_API_KEY: '' },
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
