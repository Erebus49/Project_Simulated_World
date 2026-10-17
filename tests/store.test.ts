import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorld } from '../server/engine';
import { ConflictError, Store } from '../server/store';

test('SQLite 重新打开后保留战役与设置，拒绝过期版本写入', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fogbound-store-'));
  const path = join(dir, 'test.sqlite');
  let store = new Store(path);
  try {
    const world = createWorld('持久化测试'); store.save(world);
    store.saveSettings({ mode: 'llm', baseUrl: 'http://localhost:1234/v1', model: 'mock', apiKey: 'secret-test-key' });
    store.close(); store = new Store(path);
    assert.deepEqual(store.get(world.id), world); assert.equal(store.list()[0].title, world.title);
    assert.equal(store.settings().apiKey, 'secret-test-key'); assert.equal(store.settingsView().hasApiKey, true);
    assert.ok(!JSON.stringify(store.settingsView()).includes('secret-test-key'));
    const next = structuredClone(world); next.revision++; next.title = '已更新'; store.save(next, world.revision);
    assert.throws(() => store.save({ ...next, title: '覆盖新存档' }, world.revision), ConflictError);
    assert.equal(store.get(world.id)!.title, '已更新');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
