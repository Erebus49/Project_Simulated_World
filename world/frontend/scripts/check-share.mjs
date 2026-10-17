import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const url = (await readFile('../backend/data/share-url.txt', 'utf8')).trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => { localStorage.setItem('pinecone-intro-seen','1'); localStorage.setItem('pinecone-guide-done','1'); });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(url);
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '先试谜题', exact: false }).click();
  await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('.exploration-map')?.dataset.renderer === 'webgl');
  await page.keyboard.down('w'); await page.waitForTimeout(350); await page.keyboard.up('w');
  await page.waitForTimeout(600);
  await page.keyboard.press('e');
  await page.getByRole('textbox', { name: '对角色说的话', exact: true }).waitFor();
  await page.getByRole('textbox', { name: '对角色说的话', exact: true }).fill('第四条红字是谁贴的？');
  await page.getByRole('button', { name: '交谈', exact: true }).click();
  await page.getByRole('button', { name: '观察（免费）', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="观察（免费）"]')?.disabled);
  await page.screenshot({ path: '../docs/preview-phaser-public.png', fullPage: true });
  console.log(JSON.stringify({ origin: new URL(page.url()).origin, renderer: await page.locator('.exploration-map').getAttribute('data-renderer'),
    response: await page.locator('.last-consequence').innerText(), errors,
    noDebugExposed: await page.getByRole('button', { name: '调试档案', exact: true }).count() === 0 }));
} finally { await browser.close(); }
