import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorIds, type Action, type ActorId, type Decision, type World } from '../shared/types';
import { clues } from '../shared/scenario';
import { actorById, createWorld, demoNarration, observe, projectWorld, resolveRound, validateAction } from '../server/engine';
import { demoDecision } from '../server/agents';
import { parseBackup } from '../server/backup';

function choices(overrides: Partial<Record<ActorId, Action>> = {}): Record<ActorId, Decision> {
  return Object.fromEntries(actorIds.map(id => [id, { intent: '测试中的独立行动', action: overrides[id] ?? { kind: 'rest', speech: '' } }])) as Record<ActorId, Decision>;
}
function act(world: World, overrides: Partial<Record<ActorId, Action>>, die = 15) { return resolveRound(world, choices(overrides), () => die); }

test('角色观察不包含其他人的秘密、私有目标、线索、记忆及远方事件', () => {
  const world = createWorld();
  const hidden = actorById(world, 'eira');
  hidden.secret = 'HIDDEN_SECRET'; hidden.privateGoal = 'HIDDEN_GOAL';
  hidden.memories.push({ id: 'hidden', round: 0, locationId: 'lighthouse', text: 'HIDDEN_MEMORY' });
  world.history[0].events.push({ id: 'event', round: 0, locationId: 'lighthouse', kind: 'world', text: 'HIDDEN_EVENT', private: true, visibleTo: ['eira'] });
  const observation = observe(world, 'lin');
  const serialized = JSON.stringify(observation);
  for (const word of ['HIDDEN_SECRET', 'HIDDEN_GOAL', 'HIDDEN_MEMORY', 'HIDDEN_EVENT', clues[3].text]) assert.ok(!serialized.includes(word), word);
  assert.deepEqual(observation.nearby.map(a => a.id), ['mora', 'roan']);
  assert.equal(observation.knownClues.length, 0);
  observation.self.privateGoal = 'CHANGED';
  assert.notEqual(actorById(world, 'lin').privateGoal, 'CHANGED', '观察必须是独立副本');
});

test('隐藏世界变化不影响相同角色观察和本地决策', () => {
  const world = createWorld();
  const before = observe(world, 'lin');
  const hidden = actorById(world, 'eira');
  hidden.secret = '另一个秘密'; hidden.knownClues.push(clues[0].id); hidden.locationId = 'docks'; hidden.sanity = 1;
  world.history[0].narration = '导演知道、角色不知道的内容';
  const after = observe(world, 'lin');
  assert.deepEqual(after, before);
  assert.deepEqual(demoDecision(after), demoDecision(before));
});

test('角色视角过滤全局叙事、他人决策和私有事件，导演可以回看', () => {
  const world = createWorld();
  actorById(world, 'lin').locationId = 'archive';
  const next = act(world, { lin: { kind: 'investigate', speech: '' } });
  next.history[1].narration = 'GM_ONLY_SECRET';
  const own = projectWorld(next, 'lin'), other = projectWorld(next, 'mora'), director = projectWorld(next, 'director');
  assert.equal(own.clues.length, 1); assert.equal(other.clues.length, 0);
  assert.ok(own.history[1].events.some(e => e.private && e.actorId === 'lin'));
  assert.ok(!JSON.stringify(other).includes(clues[0].text));
  assert.ok(!JSON.stringify(other).includes('GM_ONLY_SECRET'));
  assert.deepEqual(Object.keys(other.history[1].decisions), ['mora']);
  assert.equal(other.actors.find(a => a.id === 'lin')!.locationId, null);
  assert.equal(other.actors.find(a => a.id === 'lin')!.secret, undefined);
  assert.deepEqual(other.actors.find(a => a.id === 'lin')!.memories, []);
  assert.equal(director.history[1].narration, 'GM_ONLY_SECRET');
  assert.equal(director.clues.length, 4);
});

test('线索只在调查成功后私有获得；d20 判定和失败理智扣除准确', () => {
  const world = createWorld(); actorById(world, 'lin').locationId = 'archive';
  const success = act(world, { lin: { kind: 'investigate', speech: '' } }, 6);
  const check = success.history[1].events.find(e => e.check)!.check!;
  assert.deepEqual(check, { die: 6, modifier: 5, total: 11, dc: 11, success: true, skill: 'investigation' });
  assert.deepEqual(actorById(success, 'lin').knownClues, [clues[0].id]);
  const failure = act(world, { lin: { kind: 'investigate', speech: '' } }, 5);
  assert.equal(actorById(failure, 'lin').knownClues.length, 0);
  assert.equal(actorById(failure, 'lin').sanity, 19);
  assert.equal(actorById(world, 'lin').sanity, 20);
  assert.equal(world.round, 0, '不能修改上一回合');
});

test('分享需要已知线索和在场目标；私有分享不会通知第三人', () => {
  const world = createWorld(), lin = actorById(world, 'lin');
  assert.match(validateAction(world, lin, { kind: 'share', target: 'mora', clueId: clues[0].id, speech: '' })!, /掌握/);
  lin.knownClues.push(clues[0].id);
  assert.match(validateAction(world, lin, { kind: 'share', target: 'eira', clueId: clues[0].id, speech: '' })!, /场景/);
  const next = act(world, { lin: { kind: 'share', target: 'mora', clueId: clues[0].id, speech: '把这个收好。' } });
  assert.ok(actorById(next, 'mora').knownClues.includes(clues[0].id));
  assert.ok(!actorById(next, 'roan').knownClues.includes(clues[0].id));
  const shared = next.history[1].events.find(e => e.kind === 'share')!;
  assert.deepEqual(shared.visibleTo, ['lin', 'mora']);
  assert.equal(shared.private, true);
  assert.equal(actorById(next, 'lin').relationships.mora, 1);
  assert.equal(actorById(next, 'mora').relationships.lin, 1);
  assert.ok(!projectWorld(next, 'roan').history[1].events.some(e => e.id === shared.id));
});

test('移动受地图邻接约束；敏捷先行动后重新检查互动目标', () => {
  const world = createWorld(); actorById(world, 'lin').locationId = 'archive';
  assert.match(validateAction(world, actorById(world, 'lin'), { kind: 'move', target: 'docks', speech: '' })!, /相邻/);
  actorById(world, 'lin').locationId = 'square';
  const next = act(world, { roan: { kind: 'move', target: 'docks', speech: '' }, lin: { kind: 'talk', target: 'roan', speech: '等一等' } });
  assert.equal(actorById(next, 'roan').locationId, 'docks');
  assert.ok(actorById(next, 'roan').visited.includes('docks'));
  assert.ok(next.history[1].events.some(e => e.actorId === 'lin' && e.kind === 'interrupted'));
  assert.equal(actorById(next, 'lin').relationships.roan, 0);
});

test('安抚和休整恢复理智且不超过人物卡上限', () => {
  const world = createWorld(); actorById(world, 'lin').sanity = 18; actorById(world, 'lin').hp = 10;
  const next = act(world, { mora: { kind: 'calm', target: 'lin', speech: '' } });
  assert.equal(actorById(next, 'lin').sanity, 20);
  assert.equal(actorById(next, 'lin').hp, 11);
  assert.equal(actorById(next, 'mora').sanity, 20);
  actorById(world, 'lin').sanity = 0;
  assert.match(validateAction(world, actorById(world, 'lin'), { kind: 'move', target: 'archive', speech: '' })!, /休整/);
  assert.equal(validateAction(world, actorById(world, 'lin'), { kind: 'rest', speech: '' }), null);
});

test('封印受地点和个人知识约束；失败有代价，成功产生不可继续的结局', () => {
  const world = createWorld(), lin = actorById(world, 'lin');
  assert.match(validateAction(world, lin, { kind: 'seal', speech: '' })!, /灯塔/);
  lin.locationId = 'lighthouse';
  assert.match(validateAction(world, lin, { kind: 'seal', speech: '' })!, /三条/);
  lin.knownClues = clues.slice(0, 3).map(c => c.id);
  const failure = act(world, { lin: { kind: 'seal', speech: '' } }, 1);
  assert.equal(failure.status, 'active'); assert.equal(failure.danger, 2); assert.equal(actorById(failure, 'lin').sanity, 17);
  const success = act(world, { lin: { kind: 'seal', speech: '' } }, 9);
  assert.equal(success.status, 'saved'); assert.ok(success.ending); assert.equal(success.danger, 0);
  assert.throws(() => act(success, {}), /结束/);
  assert.equal(projectWorld(success, 'mora').status, 'saved');
});

test('超过十二轮或危机达到十二，故事失败且保留完整回合', () => {
  let world = createWorld();
  for (let i = 0; i < 12; i++) world = act(world, {});
  assert.equal(world.status, 'lost'); assert.equal(world.round, 12); assert.equal(world.danger, 12); assert.equal(world.history.length, 13);
  assert.equal(parseBackup(world).status, 'lost');
  const early = createWorld(); early.danger = 11;
  assert.equal(act(early, {}).status, 'lost');
});

test('完整的五角色本地演绎能调查、传递线索并完成封印，且存档可恢复', () => {
  let world = createWorld();
  while (world.status === 'active') {
    const decisions = Object.fromEntries(actorIds.map(id => [id, demoDecision(observe(world, id))])) as Record<ActorId, Decision>;
    world = resolveRound(world, decisions, () => 15);
    world.history.at(-1)!.narration = demoNarration(world);
    assert.deepEqual(parseBackup(world), world);
  }
  assert.equal(world.status, 'saved'); assert.ok(world.round <= 12);
  assert.ok(world.history.flatMap(r => r.events).some(e => e.kind === 'share'));
  assert.ok(world.history.flatMap(r => r.events).some(e => e.kind === 'investigate' && e.private));
});

test('备份拒绝重复人物、伪造线索、断裂回合和超出上限状态', () => {
  for (const mutate of [
    (w: World) => { w.actors[1].id = 'lin'; },
    (w: World) => { w.actors[0].knownClues = ['fake']; },
    (w: World) => { w.round = 1; },
    (w: World) => { w.actors[0].sanity = 30; },
    (w: World) => { w.status = 'lost'; },
  ]) { const world = createWorld(); mutate(world); assert.throws(() => parseBackup(world)); }
});
