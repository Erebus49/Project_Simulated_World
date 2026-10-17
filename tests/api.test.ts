import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { actorIds, type Decision, type Settings, type TurnProgress, type World, type WorldView } from '../shared/types';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { ProviderError, type AgentProvider } from '../server/agents';

const demo: Settings = { mode: 'demo', baseUrl: 'http://localhost:1234/v1', model: 'test-model', apiKey: '' };
async function listen(server: Server, t: TestContext) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function fixture(t: TestContext, providerFactory?: (settings: Settings) => AgentProvider) {
  const store = new Store(':memory:'); store.saveSettings(demo);
  t.after(() => store.close());
  const url = await listen(createServer(createApp(store, { providerFactory, productionDir: '/does-not-exist' })), t);
  const call = (path: string, method = 'GET', body?: unknown) => fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const create = async () => (await (await call('/api/worlds', 'POST', {})).json()) as WorldView;
  return { store, url, call, create };
}
async function stream(response: Response) { return (await response.text()).trim().split('\n').map(line => JSON.parse(line) as TurnProgress); }
function completed(events: TurnProgress[]) { const done = events.find(e => e.type === 'complete'); assert.ok(done?.type === 'complete'); return done.world; }

test('API 推进、角色投影、战报和备份导入可以连续恢复', async t => {
  const { call, create } = await fixture(t);
  const world = await create();
  assert.equal(world.round, 0); assert.equal(world.actors.length, 5);
  const response = await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 });
  assert.match(response.headers.get('content-type')!, /ndjson/);
  const events = await stream(response), next = completed(events);
  assert.equal(events.filter(e => e.type === 'agent' && e.status === 'ready').length, 5);
  assert.equal(next.round, 1); assert.equal(next.revision, 1);
  const role = await (await call(`/api/worlds/${world.id}?viewer=lin`)).json() as WorldView;
  assert.equal(role.viewer, 'lin'); assert.equal(role.actors.find(a => a.id === 'eira')!.secret, undefined);
  const report = await (await call(`/api/worlds/${world.id}/export?viewer=lin`)).text();
  assert.match(report, /林鸦的视角/); assert.ok(!report.includes(world.actors.find(a => a.id === 'eira')!.secret!));
  const backup = await (await call(`/api/worlds/${world.id}/backup`)).json() as World;
  const importedResponse = await call('/api/worlds/import', 'POST', backup); assert.equal(importedResponse.status, 201);
  const imported = await importedResponse.json() as WorldView;
  assert.notEqual(imported.id, world.id); assert.equal(imported.revision, 0); assert.equal(imported.round, 1);
  assert.deepEqual(imported.history, next.history); assert.deepEqual(imported.actors, next.actors);
  assert.equal(completed(await stream(await call(`/api/worlds/${imported.id}/turn`, 'POST', { revision: 0 }))).round, 2);
  assert.equal((await (await call(`/api/worlds/${world.id}`)).json()).round, 1, '原存档不受导入副本影响');
});

test('手动行动替代指定角色的决策，设定编辑持久化且防止过期写入', async t => {
  const { call, create } = await fixture(t);
  const world = await create();
  const profile = { personality: '冷静谨慎，先观察后行动。', publicGoal: '保护港口。', privateGoal: '找到弟弟。', behavior: 'protective' };
  const patch = await call(`/api/worlds/${world.id}/actors/lin`, 'PATCH', { revision: 0, profile });
  assert.equal(patch.status, 200); assert.equal((await patch.json()).actors[0].personality, profile.personality);
  assert.equal((await call(`/api/worlds/${world.id}/actors/lin`, 'PATCH', { revision: 0, profile })).status, 409);
  const speech = '这一次由我来作决定。';
  const next = completed(await stream(await call(`/api/worlds/${world.id}/turn?viewer=lin`, 'POST', { revision: 1, humanActorId: 'lin', action: { kind: 'move', target: 'tavern', speech } })));
  assert.equal(next.actors[0].locationId, 'tavern');
  assert.equal(next.history[1].decisions.lin!.action.speech, speech);
  assert.equal(next.actors[0].privateGoal, profile.privateGoal);
  assert.equal((await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 1 })).status, 409);
});

test('无效视角、无效人物行动和损坏备份在写入前被拒绝', async t => {
  const { call, create, store, url } = await fixture(t);
  const world = await create();
  assert.equal((await call('/api/worlds?viewer=invalid', 'POST', {})).status, 400);
  assert.equal((await call('/api/worlds/import?viewer=invalid', 'POST', store.get(world.id))).status, 400);
  assert.equal((await call('/api/worlds/import', 'POST', { version: 999 })).status, 400);
  assert.equal(store.list().length, 1);
  assert.equal((await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0, humanActorId: 'lin', action: { kind: 'seal', speech: '' } })).status, 400);
  assert.equal((await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0, humanActorId: 'lin' })).status, 400);
  assert.equal(store.get(world.id)!.revision, 0);
  assert.equal((await call('/api/worlds/not-a-uuid')).status, 400);
  const malformed = await fetch(`${url}/api/worlds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400); assert.match((await malformed.json()).error, /JSON/);
});

test('同一战役并发推进时只有一个请求能够写入', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { call, create, store } = await fixture(t, () => ({
    async decide() { await gate; return { intent: '稍作休整', action: { kind: 'rest', speech: '' } }; },
    async narrate() { return '五个人各自停下了脚步。雾仍然在港口游移。'; },
  }));
  const world = await create();
  const first = await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 });
  try {
    assert.equal((await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 })).status, 409);
    assert.equal(store.get(world.id)!.round, 0);
  } finally { release(); }
  assert.equal(completed(await stream(first)).round, 1);
  assert.equal(store.get(world.id)!.revision, 1);
});

test('主持人失败会回滚整轮；重试仍可使用原始版本', async t => {
  let fail = true;
  const { call, create, store } = await fixture(t, () => ({
    async decide() { return { intent: '向档案馆出发', action: { kind: 'rest', speech: '' } }; },
    async narrate() { if (fail) throw new ProviderError('模拟主持人失败，本轮尚未写入存档。'); return '海雾里，每个人都在重新整理自己的思绪。'; },
  }));
  const world = await create(), original = store.get(world.id);
  const failed = await stream(await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 }));
  assert.equal(failed.at(-1)!.type, 'error'); assert.ok(!failed.some(e => e.type === 'complete'));
  assert.deepEqual(store.get(world.id), original);
  fail = false;
  assert.equal(completed(await stream(await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 }))).round, 1);
});

type ChatCall = { model: string; messages: { role: string; content: string }[]; authorization: string | undefined };
async function mockChat(t: TestContext, reply: (call: ChatCall) => { status?: number; content?: unknown; raw?: string }) {
  const calls: ChatCall[] = [];
  const url = await listen(createServer(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const call = { ...body, authorization: req.headers.authorization }; calls.push(call);
    const result = reply(call);
    res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: result.raw ?? JSON.stringify(result.content) } }] }));
  }), t);
  return { url, calls };
}

test('真实 HTTP 适配器分别调用五角色和 GM，过滤私有信息且不返回密钥', async t => {
  const mock = await mockChat(t, call => {
    const payload = JSON.parse(call.messages[1].content);
    return { content: payload.role === 'Game Master' ? { narration: '雾中的五个人都停下来休整，各自守着未说出口的秘密。' } : { intent: '等待与休整', action: { kind: 'rest', speech: '' } } satisfies Decision };
  });
  const { call, create, store } = await fixture(t);
  const world = await create();
  const settingsResponse = await call('/api/settings', 'PUT', { mode: 'llm', baseUrl: mock.url + '/v1', model: 'independent-roles', apiKey: 'PRIVATE_HTTP_TEST_KEY' });
  const settings = await settingsResponse.json();
  assert.equal(settings.hasApiKey, true); assert.equal(settings.apiKey, undefined);
  assert.ok(!JSON.stringify(settings).includes('PRIVATE_HTTP_TEST_KEY'));
  const next = completed(await stream(await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 })));
  assert.equal(mock.calls.length, 6); assert.equal(next.round, 1);
  const roles = mock.calls.slice(0, 5).map(c => JSON.parse(c.messages[1].content));
  assert.deepEqual(roles.map(o => o.self.id).sort(), [...actorIds].sort());
  assert.ok(roles.every(o => o.round === 0), '所有人依据同一回合快照决策');
  for (const [index, role] of roles.entries()) {
    const encoded = JSON.stringify(role);
    for (const other of world.actors.filter(a => a.id !== role.self.id)) {
      assert.ok(!encoded.includes(other.secret!), `${role.self.id} 不能看到 ${other.id} 的秘密`);
      assert.ok(!encoded.includes(other.privateGoal!));
    }
    assert.equal(mock.calls[index].authorization, 'Bearer PRIVATE_HTTP_TEST_KEY');
  }
  assert.equal(JSON.parse(mock.calls[5].messages[1].content).role, 'Game Master');
  assert.ok(!JSON.stringify(next).includes('PRIVATE_HTTP_TEST_KEY'));
  assert.ok(!(await (await call(`/api/worlds/${world.id}/backup`)).text()).includes('PRIVATE_HTTP_TEST_KEY'));
  assert.equal(store.get(world.id)!.round, 1);
});

test('模型服务 HTTP 错误和非法行动格式会显示错误且保持存档', async t => {
  for (const kind of ['http', 'format', 'narrator'] as const) {
    const mock = await mockChat(t, call => {
      const isGM = JSON.parse(call.messages[1].content).role === 'Game Master';
      if (kind === 'http' || (kind === 'narrator' && isGM)) return { status: 503 };
      if (kind === 'format') return { content: { action: { kind: 'teleport' } } };
      return { content: { intent: '先等待', action: { kind: 'rest', speech: '' } } };
    });
    const { call, create, store } = await fixture(t);
    const world = await create(), original = store.get(world.id);
    store.saveSettings({ ...demo, mode: 'llm', baseUrl: mock.url + '/v1', apiKey: 'SECRET_KEY_NEVER_ECHO' });
    const events = await stream(await call(`/api/worlds/${world.id}/turn`, 'POST', { revision: 0 }));
    assert.equal(events.at(-1)!.type, 'error', kind);
    assert.ok(!JSON.stringify(events).includes('SECRET_KEY_NEVER_ECHO'));
    assert.deepEqual(store.get(world.id), original, kind);
  }
});

test('没有密钥无法切换模型模式；密钥留空保留、主动清除后移除', async t => {
  const { call, store } = await fixture(t);
  assert.equal((await call('/api/settings', 'PUT', { ...demo, mode: 'llm' })).status, 400);
  assert.equal((await call('/api/settings', 'PUT', { ...demo, mode: 'llm', apiKey: 'KEY' })).status, 200);
  assert.equal((await call('/api/settings', 'PUT', { ...demo, mode: 'llm' })).status, 200);
  assert.equal(store.settings().apiKey, 'KEY');
  assert.equal((await call('/api/settings', 'PUT', { ...demo, clearApiKey: true })).status, 200);
  assert.equal(store.settingsView().hasApiKey, false);
});
