import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => { localStorage.setItem('pinecone-intro-seen','1'); localStorage.setItem('pinecone-guide-done','1'); });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('../docs', { recursive: true });
try {
  await page.goto('http://127.0.0.1:8000');
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: '../docs/preview-phaser-menu.png', fullPage: true });
  await page.getByRole('button', { name: '先试谜题', exact: false }).click();
  await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '../docs/preview-phaser-world.png', fullPage: true });
  console.log(JSON.stringify({ renderer: await page.locator('.exploration-map').getAttribute('data-renderer'), errors, canvasCount: await page.locator('.phaser-world canvas').count(), position: await page.locator('.exploration-map').evaluate(element => ({ ...element.dataset })) }));
} catch (error) { console.log(JSON.stringify({ failure: error.message, errors })); }
finally { await browser.close(); }
