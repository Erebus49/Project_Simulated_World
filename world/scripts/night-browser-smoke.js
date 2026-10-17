async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const test = await context.newPage();
  test.setDefaultTimeout(5000);
  const errors = [];
  test.on('pageerror', error => errors.push(error.message));
  const move = async (key, ms) => { await test.keyboard.down(key); await test.waitForTimeout(ms); await test.keyboard.up(key); await test.waitForTimeout(220); };
  const ready = async () => test.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent === '观察（免费）' && !button.disabled));
  const position = () => test.locator('.exploration-map').evaluate(element => ({ ...element.dataset }));
  try {
    await test.goto('http://127.0.0.1:8000');
    await test.getByRole('dialog').waitFor();
    await test.getByRole('button', { name: '先试谜题', exact: false }).click();
    await test.getByRole('button', { name: '进入第一夜', exact: false }).click();
    await test.getByRole('dialog').waitFor({ state: 'hidden' });
    await move('w', 420); await move('d', 650);
    await test.keyboard.press('e');
    await test.getByRole('button', { name: '阅读留镇须知', exact: true }).click();
    await test.getByRole('heading', { name: '夜间留镇须知', exact: true }).waitFor();
    await ready();
    await move('a', 2300); await test.keyboard.press('e');
    const textbox = test.getByRole('textbox', { name: '对角色说的话', exact: true });
    await textbox.waitFor();
    const before = await position();
    await textbox.fill('旧账册里的柜号应该按什么顺序？'); await textbox.pressSequentially('wasd');
    const typingDidNotMove = JSON.stringify(before) === JSON.stringify(await position());
    await test.getByRole('button', { name: '交谈', exact: true }).click(); await ready();
    await test.getByRole('button', { name: '结束当前交互', exact: true }).click();
    await move('w', 430); await test.keyboard.press('e');
    await test.getByRole('button', { name: '翻阅旧账册', exact: true }).click();
    await test.getByRole('heading', { name: '柜台旧账册', exact: true }).waitFor(); await ready();
    await test.getByRole('textbox', { name: '回收柜三位密码', exact: true }).fill('317');
    await test.getByRole('button', { name: '尝试打开回收柜', exact: true }).click();
    await test.getByRole('heading', { name: '回收柜中的归还联', exact: true }).waitFor(); await ready();
    const journalBeforeRefresh = await test.locator('.clue-page h3').allTextContents();
    await test.reload(); await ready();
    const restored = await position();
    await move('s', 430); await move('d', 3800); await move('w', 430);
    await test.keyboard.press('e');
    await test.getByRole('button', { name: '按下静音键', exact: true }).click(); await ready();
    await test.getByRole('button', { name: '封存归还联', exact: true }).click(); await ready();
    await test.getByRole('button', { name: '拉下电闸', exact: true }).click(); await ready();
    await move('s', 430); await move('a', 2000); await move('s', 1200);
    await test.keyboard.press('e');
    await test.getByRole('button', { name: '尝试离镇', exact: true }).click();
    await test.getByRole('dialog', { name: '你没有回头。', exact: true }).waitFor();
    const result = { typingDidNotMove, journalBeforeRefresh, restored, ending: await test.getByRole('dialog').innerText(), overflow: await test.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors };
    await test.screenshot({ path: 'E:/cslearn/world/docs/preview-night-solved.png', fullPage: true });
    return result;
  } catch (error) {
    await test.screenshot({ path: 'E:/cslearn/world/docs/preview-night-test-failure.png', fullPage: true });
    return { failure: error.message, position: await position().catch(() => null), panel: await test.locator('.night-interaction').innerText().catch(() => ''), alerts: await test.locator('[role=alert]').allTextContents(), errors };
  } finally { await context.close(); }
}
