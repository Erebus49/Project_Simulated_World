import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { WorldView } from '../../shared/types';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, request }) => {
  const captured: string[] = []; errors.set(page, captured);
  page.on('pageerror', error => captured.push(error.message));
  await request.put('/api/settings', { data: { mode: 'demo', baseUrl: 'http://localhost:1234/v1', model: 'local-test', clearApiKey: true } });
  const response = await request.post('/api/worlds', { data: { title: '第七声钟鸣' } });
  const world = await response.json() as WorldView;
  await page.addInitScript(id => {
    if (!localStorage.getItem('fogbound-world')) { localStorage.setItem('fogbound-world', id); localStorage.setItem('fogbound-viewer', 'director'); }
  }, world.id);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '推进一轮', exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('桌面：地图、编辑人物、接管行动、回放和刷新恢复', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('fogbound-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /旧档案馆，/ }).click();
  await expect(page.locator('.scene-caption h3')).toContainText('旧档案馆');
  await page.getByRole('button', { name: '打开人物档案', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('不曾说出的秘密');
  await dialog.getByRole('button', { name: '编辑人物设定' }).click();
  await dialog.getByLabel('公开目标', { exact: true }).fill('先查档案，再与同伴会合。');
  await dialog.getByRole('button', { name: '保存人物卡' }).click();
  await expect(dialog).toContainText('先查档案，再与同伴会合。');
  await dialog.getByRole('button', { name: '接管角色' }).click();
  await expect(page.getByText('现在，你是林鸦')).toBeVisible();
  await page.getByLabel('选择行动').selectOption('move');
  await page.getByLabel('行动目标').selectOption('archive');
  await page.getByLabel('角色台词').fill('我先去看看旧档案，等我带答案回来。');
  await page.getByRole('button', { name: '提交行动' }).click();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  await page.getByRole('tab', { name: '行动与骰点' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('我先去看看旧档案');
  await page.getByRole('button', { name: '交还角色' }).click();
  await expect(page.getByRole('button', { name: '推进一轮', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '上一轮', exact: true }).click();
  await expect(page.getByRole('button', { name: '回到故事的此刻' })).toBeVisible();
  await page.getByRole('button', { name: '回到故事的此刻' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('我先去看看旧档案');
  // addInitScript seeds only an empty browser; reload should preserve the chosen perspective.
  await page.reload();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  await expect(page.getByRole('button', { name: '林鸦的视角', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.actor-preview')).toContainText('先查档案，再与同伴会合。');
});

test('角色视角只能查看本人秘密、记忆和已知线索', async ({ page }) => {
  await page.getByRole('tab', { name: '线索手记', exact: true }).click();
  await expect(page.locator('.clue-card')).toHaveCount(4);
  await page.getByRole('button', { name: '角色视角', exact: true }).click();
  await expect(page.getByRole('tab', { name: '线索手记 · 0' })).toBeVisible();
  await expect(page.locator('.clue-card')).toHaveCount(0);
  await expect(page.locator('.character-card').filter({ hasText: '伊蕾' })).toContainText('视野之外');
  await page.locator('.character-card').filter({ hasText: '伊蕾' }).click();
  await page.getByRole('button', { name: '打开人物档案', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('这是另一名角色的私有经历');
  await expect(dialog).not.toContainText('母亲的声音');
  await dialog.getByRole('tab', { name: '记忆 0' }).click();
  await expect(dialog).toContainText('你无法直接读取其他角色的记忆');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '导演视角', exact: true }).click();
  await page.getByRole('button', { name: '打开人物档案', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('母亲的声音');
});

test('完整存档下载、创建新战役和导入副本', async ({ page, request }, testInfo) => {
  await page.getByRole('button', { name: '推进一轮', exact: true }).click();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  const originalId = await page.evaluate(() => localStorage.getItem('fogbound-world'));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整存档', exact: true }).click();
  const download = await downloadPromise, backupPath = testInfo.outputPath('campaign.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.id).toBe(originalId); expect(backup.actors).toHaveLength(5);
  await page.getByRole('button', { name: '新的冒险', exact: true }).click();
  await page.getByLabel('为这段冒险命名').fill('另一个雾夜');
  await page.getByRole('button', { name: '开启新冒险', exact: true }).click();
  await expect(page.getByRole('heading', { name: '另一个雾夜.' })).toBeVisible();
  await expect(page.locator('.round-counter strong')).toHaveText('00 / 12');
  await page.getByRole('button', { name: '打开冒险档案', exact: true }).click();
  await page.getByLabel('选择完整战役存档').setInputFiles(backupPath);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  const importedId = await page.evaluate(() => localStorage.getItem('fogbound-world'));
  expect(importedId).not.toBe(originalId);
  expect((await (await request.get(`/api/worlds/${originalId}`)).json()).round).toBe(1);
  await page.getByRole('button', { name: '打开冒险档案', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /另一个雾夜/ }).click();
  await expect(page.getByRole('heading', { name: '另一个雾夜.' })).toBeVisible();
  const reportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前视角战报', exact: true }).click();
  expect((await reportPromise).suggestedFilename()).toMatch(/\.md$/);
});

test('自动演绎可以暂停，恢复后能推进到故事结局', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '自动演绎', exact: true }).click();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  await page.getByRole('button', { name: '暂停演绎', exact: true }).click();
  const paused = await page.locator('.round-counter strong').innerText();
  await page.waitForTimeout(2100);
  await expect(page.locator('.round-counter strong')).toHaveText(paused);
  for (let i = 0; i < 12 && await page.getByRole('button', { name: '推进一轮', exact: true }).count(); i++) {
    await page.getByRole('button', { name: '推进一轮', exact: true }).click();
    await expect(page.getByRole('button', { name: '推进一轮', exact: true }).or(page.getByRole('button', { name: '开启下一段故事' }))).toBeEnabled();
  }
  await expect(page.getByRole('button', { name: '开启下一段故事' })).toBeVisible();
  await expect(page.locator('.ending-controls')).toContainText(/雾港幸存|迷失于雾中/);
  await page.screenshot({ path: testInfo.outputPath('fogbound-ending.png'), fullPage: true });
});

test('手机：地图和人物档案可操作，接管表单适配窄屏', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath('fogbound-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /雾灯酒馆，/ }).press('Enter');
  await expect(page.locator('.scene-caption h3')).toContainText('雾灯酒馆');
  await page.getByRole('button', { name: '打开人物档案', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '接管角色', exact: true }).click();
  await page.getByLabel('角色台词').fill('我会找到回家的路。');
  await page.getByRole('button', { name: '提交行动', exact: true }).click();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
  await expect(page.getByRole('button', { name: '交还角色' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fogbound-mobile-player.png'), fullPage: true });
});

test('故事流失败给出明确提示，当前回合不前进', async ({ page }) => {
  await page.route('**/api/worlds/*/turn?*', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({ type: 'error', message: '模型服务连接失败；本轮尚未写入存档。' }) + '\n',
  }));
  await page.getByRole('button', { name: '推进一轮', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('本轮尚未写入存档');
  await expect(page.locator('.round-counter strong')).toHaveText('00 / 12');
  await expect(page.getByRole('button', { name: '推进一轮', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '刷新存档', exact: true }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('设置中的模型校验错误可见且本地模式仍能继续', async ({ page }) => {
  await page.getByRole('button', { name: '模型设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /连接语言模型/ }).check();
  await dialog.getByRole('button', { name: '保存设置' }).click();
  await expect(dialog.getByRole('alert')).toContainText('API Key');
  await dialog.getByRole('radio', { name: /本地演示/ }).check();
  await dialog.getByRole('button', { name: '保存设置' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '推进一轮', exact: true }).click();
  await expect(page.locator('.round-counter strong')).toHaveText('01 / 12');
});
