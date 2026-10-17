import { chromium, expect, test, type Page } from '@playwright/test';

const ready = (page: Page) => expect(page.getByRole('button', { name: '观察（免费）', exact: true })).toBeEnabled();
async function start(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('pinecone-intro-seen', '1'); localStorage.setItem('pinecone-guide-done', '1'); });
  await page.goto('/');
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '先试谜题', exact: false }).click();
  await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-renderer', 'webgl');
  await ready(page);
}
async function walk(page: Page, code: string, axis: 'x' | 'y', destination: number, increasing: boolean) {
  await page.keyboard.down(code);
  try {
    await page.waitForFunction(({ axis, destination, increasing }) => {
      const current = Number(document.querySelector('.exploration-map')?.getAttribute('data-player-' + axis));
      return increasing ? current >= destination : current <= destination;
    }, { axis, destination, increasing }, { timeout: 10000, polling: 'raf' });
  } finally { await page.keyboard.up(code); }
  await page.waitForTimeout(240);
}
async function interact(page: Page, button: string) {
  await page.keyboard.press('e');
  await page.getByRole('button', { name: button, exact: true }).click();
  await ready(page);
}

test('Phaser WebGL mystery: keyboard exploration, dialogue, save restore and escape', async ({ page }) => {
  const exceptions: string[] = [];
  page.on('pageerror', error => exceptions.push(error.message));
  await start(page);
  const meaningfulPixels = await page.locator('.phaser-world canvas').evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas'); copy.width = 40; copy.height = 24;
    const ctx = copy.getContext('2d')!; ctx.drawImage(canvas, 0, 0, 40, 24);
    const data = ctx.getImageData(0, 0, 40, 24).data;
    return new Set(Array.from({ length: 960 }, (_, index) => [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]].join(','))).size;
  });
  expect(meaningfulPixels).toBeGreaterThan(50);
  await walk(page, 'w', 'y', 183, false); await walk(page, 'd', 'x', 284, true);
  await interact(page, '阅读留镇须知');
  await expect(page.getByRole('heading', { name: '夜间留镇须知', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '收起夜行手记', exact: true }).click();
  await walk(page, 'a', 'x', 130, false);
  await walk(page, 'w', 'y', 172, false);
  await page.getByRole('button', { name: /^与阿栗交谈/ }).click();
  const textbox = page.getByRole('textbox', { name: '对角色说的话', exact: true });
  await expect(textbox).toBeVisible();
  const before = await page.locator('.exploration-map').getAttribute('data-player-x');
  await textbox.pressSequentially('wasd');
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-player-x', before!);
  await textbox.fill('你知道柜号的顺序吗？');
  await page.getByRole('button', { name: '交谈', exact: true }).click(); await ready(page);
  await page.screenshot({ path: '../docs/preview-immersive-dialogue.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '结束当前交互', exact: true }).click();
  await walk(page, 'w', 'y', 153, false);
  await interact(page, '翻阅旧账册');
  await page.getByRole('button', { name: '收起夜行手记', exact: true }).click();
  await page.getByRole('textbox', { name: '回收柜三位密码', exact: true }).fill('317');
  await page.getByRole('button', { name: '尝试打开回收柜', exact: true }).click(); await ready(page);
  await expect(page.getByRole('heading', { name: '回收柜中的归还联', exact: true })).toBeVisible();
  await page.screenshot({ path: '../docs/preview-phaser-clues.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '收起夜行手记', exact: true }).click();
  await page.reload(); await ready(page);
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-player-y', /15[0-6]/);
  await page.getByRole('button', { name: '打开夜行手记', exact: true }).click();
  await expect(page.locator('.clue-page')).toHaveCount(3);
  await page.getByRole('button', { name: '收起夜行手记', exact: true }).click();
  await walk(page, 's', 'y', 183, true); await walk(page, 'd', 'x', 375, true); await walk(page, 'w', 'y', 153, false);
  await interact(page, '按下静音键');
  await page.getByRole('button', { name: '封存归还联', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: '拉下电闸', exact: true }).click(); await ready(page);
  await walk(page, 's', 'y', 183, true); await walk(page, 'a', 'x', 240, false); await walk(page, 's', 'y', 264, true);
  await page.keyboard.press('e');
  await page.getByRole('button', { name: '尝试离镇', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '你没有回头。', exact: true })).toBeVisible();
  expect(exceptions).toEqual([]);
});

test('mobile: camera follows integer pixels, touch movement, pause in dialog, effects and sound controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-pixel-scale', '3');
  const before = Number(await page.locator('.exploration-map').getAttribute('data-player-y'));
  const up = page.getByRole('button', { name: '向上走', exact: true });
  await up.hover(); await page.mouse.down(); await page.waitForTimeout(320); await page.mouse.up(); await page.waitForTimeout(250);
  expect(Number(await page.locator('.exploration-map').getAttribute('data-player-y'))).toBeLessThan(before - 10);
  await page.getByRole('button', { name: '玩法说明', exact: true }).click();
  const paused = await page.locator('.exploration-map').getAttribute('data-player-y');
  await page.keyboard.down('s'); await page.waitForTimeout(200); await page.keyboard.up('s');
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-player-y', paused!);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '光效：开', exact: true }).click();
  await expect(page.getByRole('button', { name: '光效：简化', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '声音：关', exact: true }).click();
  await expect(page.getByRole('button', { name: '声音：开', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '../docs/preview-phaser-mobile.png', fullPage: true, animations: 'disabled' });
});

test('full screen preserves the DOM interaction panels and resize keeps a single game canvas', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '全屏游戏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className.trim())).toBe('night-app immersive');
  await expect(page.locator('.immersive-game')).toBeVisible();
  await page.getByRole('button', { name: '全屏游戏', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-pixel-scale', '3');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-pixel-scale', '3');
  await expect(page.locator('.phaser-world canvas')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('devices without WebGL get a playable Canvas renderer', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => { localStorage.setItem('pinecone-intro-seen', '1'); localStorage.setItem('pinecone-guide-done', '1'); });
    await page.goto(process.env.TOWN_TEST_URL || 'http://127.0.0.1:8000');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '先试谜题', exact: false }).click();
    await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expect(page.locator('.exploration-map')).toHaveAttribute('data-renderer', 'canvas-fallback');
    await ready(page);
    await walk(page, 'w', 'y', 185, false);
    await expect(page.locator('.renderer-fallback')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});

test('expanded map: eastern trail and southern garden, camera following and in-world journal', async ({ page }) => {
  await start(page);
  const canvasBox = await page.locator('.exploration-map').boundingBox();
  expect(canvasBox!.width).toBe(1440);
  expect(canvasBox!.height).toBe(1000);
  await walk(page, 'w', 'y', 183, false);
  await walk(page, 'd', 'x', 668, true);
  expect(Number(await page.locator('.exploration-map').getAttribute('data-camera-x'))).toBeGreaterThan(250);
  await interact(page, '查看林间路牌');
  await expect(page.getByRole('heading', { name: '林间路牌背面', exact: true })).toBeVisible();
  await page.screenshot({ path: '../docs/preview-expanded-trail.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '收起夜行手记', exact: true }).click();
  await walk(page, 's', 'y', 335, true);
  await walk(page, 'a', 'x', 511, false);
  await interact(page, '辨认庭院旧碑');
  await expect(page.getByRole('heading', { name: '庭院交接旧碑', exact: true })).toBeVisible();
  const map = await page.locator('.exploration-map').boundingBox();
  for (const selector of ['.world-journal']) {
    const box = await page.locator(selector).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(map!.x);
    expect(box!.y).toBeGreaterThanOrEqual(map!.y);
    expect(box!.x + box!.width).toBeLessThanOrEqual(map!.x + map!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(map!.y + map!.height + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
  await page.screenshot({ path: '../docs/preview-expanded-garden.png', fullPage: true, animations: 'disabled' });
});

test('phone conversation and password remain inside the game viewport, J toggles the journal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await walk(page, 'w', 'y', 183, false);
  await page.keyboard.press('e');
  const textbox = page.getByRole('textbox', { name: '对角色说的话', exact: true });
  await textbox.fill('你知道这里的规则吗？');
  await page.getByRole('button', { name: '交谈', exact: true }).click(); await ready(page);
  const conversation = await page.locator('.world-dialogue').boundingBox();
  expect(conversation!.y).toBeGreaterThan(55);
  expect(conversation!.y + conversation!.height).toBeLessThan(844);
  await page.screenshot({ path: '../docs/preview-immersive-mobile-dialogue.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '结束当前交互', exact: true }).click();
  await walk(page, 'a', 'x', 130, false);
  await walk(page, 'w', 'y', 153, false);
  await page.keyboard.press('e');
  const password = page.getByRole('textbox', { name: '回收柜三位密码', exact: true });
  await expect(password).toBeVisible();
  const before = await page.locator('.exploration-map').getAttribute('data-player-y');
  await password.pressSequentially('wasd317');
  await expect(password).toHaveValue('317');
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-player-y', before!);
  await password.press('Escape');
  await page.keyboard.press('j');
  await expect(page.locator('.world-journal')).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.locator('.world-journal')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(password).toBeVisible();
  const box = await password.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('first visit has a short background introduction, guide, and help replay', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: '欢迎来到松果镇', exact: true })).toBeVisible();
  await expect(page.getByText('庆典结束了，你却没能离开。', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../docs/preview-first-visit.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByText('先走走，再问问。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '开始探索', exact: true }).click();
  await page.getByRole('button', { name: '先试谜题', exact: false }).click();
  await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await expect(page.getByRole('region', { name: '新手引导', exact: true })).toBeVisible();
  await walk(page, 'd', 'x', 265, true);
  await expect(page.getByRole('heading', { name: '找到广场公告栏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '结束新手引导', exact: true }).click();
  await page.reload(); await ready(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '玩法说明', exact: true }).click();
  await page.getByRole('button', { name: '重新看新手介绍', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '欢迎来到松果镇', exact: true })).toBeVisible();
});

test('grass movement, visible NPC routines, readable dialogue, and persistent A+ setting', async ({ page }) => {
  await start(page);
  const caretaker = page.locator('.phaser-nameplate[data-character-id="caretaker"]');
  await expect(caretaker).toBeVisible();
  const before = await caretaker.getAttribute('data-npc-x');
  await expect.poll(() => caretaker.getAttribute('data-npc-x'), { timeout: 6000 }).not.toBe(before);
  await expect(page.locator('.npc-activity').first()).toBeVisible();
  await walk(page, 'd', 'x', 280, true);
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-player-y', '211');
  await walk(page, 'a', 'x', 239, false);
  await walk(page, 'w', 'y', 187, false);
  await page.keyboard.press('e');
  const textbox = page.getByRole('textbox', { name: '对角色说的话', exact: true });
  await expect(textbox).toBeVisible();
  expect(await textbox.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await textbox.fill('你为什么还留在这里？');
  await page.getByRole('button', { name: '交谈', exact: true }).click(); await ready(page);
  const consequence = page.locator('.world-dialogue .last-consequence');
  expect(await consequence.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: '加大字号', exact: true }).click();
  expect(await textbox.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(19);
  await page.screenshot({ path: '../docs/preview-readable-world.png', fullPage: true, animations: 'disabled' });
  await page.reload(); await ready(page);
  await expect(page.getByRole('button', { name: '恢复标准字号', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('phone first-visit background is readable and skip starts a normal game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: '欢迎来到松果镇', exact: true })).toBeVisible();
  expect(await page.locator('.world-intro p').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBe(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '../docs/preview-intro-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '直接开始', exact: true }).click();
  await page.getByRole('button', { name: '先试谜题', exact: false }).click();
  await page.getByRole('button', { name: '进入第一夜', exact: false }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '结束新手引导', exact: true }).click();
  await expect(page.locator('.exploration-map')).toHaveAttribute('data-renderer', 'webgl');
});

test('residents move continuously between sparse updates, then stay to perform fixed work without model calls', async ({ page }) => {
  await start(page);
  const caretaker = page.locator('.phaser-nameplate[data-character-id="caretaker"]');
  await expect(caretaker).toHaveAttribute('data-motion-phase', 'walking');
  const frames = await page.evaluate(async () => {
    const samples: { time: number; x: number; y: number; phase: string }[] = [];
    const began = performance.now();
    await new Promise<void>(resolve => {
      const sample = () => {
        const node = document.querySelector<HTMLElement>('.phaser-nameplate[data-character-id="caretaker"]');
        if (node) samples.push({ time: performance.now() - began, x: Number(node.dataset.npcX), y: Number(node.dataset.npcY), phase: node.dataset.motionPhase || '' });
        if (performance.now() - began < 700) setTimeout(sample, 80); else resolve();
      };
      sample();
    });
    return samples;
  });
  const steps = frames.slice(1).map((point, i) => ({ distance: Math.hypot(point.x - frames[i].x, point.y - frames[i].y), moving: point.phase === 'walking' && frames[i].phase === 'walking' }));
  const movingSteps = steps.filter(step => step.moving);
  expect(movingSteps.length).toBeGreaterThanOrEqual(4);
  expect(movingSteps.filter(step => step.distance > .2).length / movingSteps.length).toBeGreaterThan(.85);
  expect(Math.max(...movingSteps.map(step => step.distance))).toBeLessThan(4);
  await expect(caretaker).toHaveAttribute('data-motion-phase', 'working', { timeout: 6000 });
  await page.waitForTimeout(500);
  const workingPosition = { x: Number(await caretaker.getAttribute('data-npc-x')), y: Number(await caretaker.getAttribute('data-npc-y')) };
  await page.waitForTimeout(1800);
  await expect(caretaker).toHaveAttribute('data-motion-phase', 'working');
  expect(Math.hypot(Number(await caretaker.getAttribute('data-npc-x')) - workingPosition.x, Number(await caretaker.getAttribute('data-npc-y')) - workingPosition.y)).toBeLessThan(1);
  await expect(caretaker.locator('.npc-activity')).toContainText('控制台');
  const id = await page.evaluate(() => localStorage.getItem('pinecone-night-game'));
  const debugResponse = await page.request.get(`/api/debug/games/${id}`);
  const debug = await debugResponse.json();
  expect(debug.calls).toHaveLength(0);
  expect(debug.world.turn).toBe(0);
  await page.screenshot({ path: '../docs/preview-npc-jobs.png', fullPage: true, animations: 'disabled' });
});

test('overlapping residents and objects have exactly one E target, Q switches to a conversation', async ({ page }) => {
  await start(page);
  await walk(page, 'w', 'y', 183, false);
  await walk(page, 'd', 'x', 286, true);
  const scene = page.locator('.exploration-map');
  const targets = page.locator('.phaser-scene-overlay [data-e-target="true"]');
  await expect(scene).toHaveAttribute('data-interaction-target', 'notice');
  await expect(targets).toHaveCount(1);
  await expect(targets).toHaveAccessibleName('调查公告栏，按 E');
  await page.keyboard.press('e');
  await expect(page.locator('.night-interaction-header h2')).toContainText('公告栏');
  await page.getByRole('button', { name: '结束当前交互', exact: true }).click();
  await expect(page.getByRole('button', { name: '切换交互目标', exact: true })).toBeVisible();
  await page.keyboard.press('q');
  await expect(scene).not.toHaveAttribute('data-interaction-target', 'notice');
  await expect(targets).toHaveCount(1);
  await expect(targets).toHaveAccessibleName(/^与.+交谈，按 E$/);
  const targetName = (await targets.innerText()).replace(' · E', '');
  await page.keyboard.press('e');
  await expect(page.getByRole('textbox', { name: '对角色说的话', exact: true })).toBeVisible();
  await expect(page.locator('.night-interaction-header h2')).toContainText(targetName);
  await page.getByRole('button', { name: '结束当前交互', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTarget = await scene.getAttribute('data-interaction-target');
  await page.getByRole('button', { name: '切换交互目标', exact: true }).click();
  await expect(scene).not.toHaveAttribute('data-interaction-target', mobileTarget!);
  await expect(targets).toHaveCount(1);
  await expect(page.locator('.npc-chatter')).toBeVisible();
  const bubbleBounds = await page.locator('.npc-chatter').boundingBox();
  expect(bubbleBounds!.x).toBeGreaterThanOrEqual(0);
  expect(bubbleBounds!.x + bubbleBounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../docs/preview-resident-chatter-mobile.png', fullPage: true, animations: 'disabled' });
});

test('nearby residents speak in work bubbles and keep working unless explicitly in conversation', async ({ page }) => {
  await start(page);
  const mayor = page.locator('.phaser-nameplate[data-character-id="mayor"]');
  const reporter = page.locator('.phaser-nameplate[data-character-id="reporter"]');
  await expect(reporter).toHaveAttribute('data-motion-phase', 'walking');
  const bubble = page.locator('.npc-chatter');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toBeVisible();
  await expect(bubble.locator('span')).not.toBeEmpty();
  expect(await bubble.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(15);
  const beforeX = Number(await reporter.getAttribute('data-npc-x'));
  await page.waitForTimeout(800);
  expect(Number(await reporter.getAttribute('data-npc-x')) - beforeX).toBeGreaterThan(3);
  await walk(page, 'w', 'y', 190, false);
  await walk(page, 'd', 'x', 266, true);
  await page.getByRole('button', { name: /^与林镇长交谈/ }).click();
  await expect(mayor).toHaveAttribute('data-motion-phase', 'paused');
  const id = await page.evaluate(() => localStorage.getItem('pinecone-night-game'));
  const before = await (await page.request.get(`/api/debug/games/${id}`)).json();
  await page.waitForTimeout(1800);
  const after = await (await page.request.get(`/api/debug/games/${id}`)).json();
  expect(after.world.routines.clock - before.world.routines.clock).toBeGreaterThan(1);
  const caretakerBefore = before.world.routines.actors.caretaker;
  const caretakerAfter = after.world.routines.actors.caretaker;
  expect(JSON.stringify({ position: caretakerAfter.position, work: caretakerAfter.work_left })).not.toBe(JSON.stringify({ position: caretakerBefore.position, work: caretakerBefore.work_left }));
  expect(after.world.routines.actors.mayor.phase).toBe('paused');
  expect(after.calls).toHaveLength(0);
  expect(after.world.turn).toBe(0);
  await page.getByRole('button', { name: '结束当前交互', exact: true }).click();
  await expect(mayor).not.toHaveAttribute('data-motion-phase', 'paused');
  await expect(bubble).toBeVisible();
  await page.screenshot({ path: '../docs/preview-resident-chatter.png', fullPage: true, animations: 'disabled' });
});
