import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActorId, Decision, World } from '../investigation/shared/types.js';
import { CLUE_POINTS, EXIT_POINTS } from '../investigation/shared/scene.js';
import { createKillerWorld } from '../investigation/server/killer.js';
import { projectWorld, resolveRound, validateAction } from '../investigation/server/engine.js';

const decisionsFor = (world: World): Record<ActorId, Decision> => Object.fromEntries(world.actors.map(actor => [actor.id, {
  intent: '在场景中等待并观察。', action: { kind: 'rest' as const, speech: '' },
}])) as Record<ActorId, Decision>;

test('killer campaign has exactly one human investigator; player view hides other agents private sheets and director state', () => {
  const world = createKillerWorld('test', 'avery', true);
  assert.equal(world.playerActorId, 'avery');
  assert.equal(world.actors.filter(actor => actor.role === 'PL').length, 3);
  assert.equal(world.actors.length, 8);
  const player = projectWorld(world, 'avery');
  assert.equal(player.investigation, undefined);
  assert.equal(player.actors.find(actor => actor.id === 'morgan')?.secret, undefined);
  assert.equal(player.actors.find(actor => actor.id === 'morgan')?.knownClues?.length, 0);
  assert.equal(player.actors.find(actor => actor.id === 'avery')?.secret, world.actors.find(actor => actor.id === 'avery')?.secret);
  assert.equal(player.actors.find(actor => actor.id === 'hudson')?.locationId, null);
});

test('a scene interaction needs the matching local object range; local walking itself does not advance story time', () => {
  const world = createKillerWorld('test', 'avery', true);
  const investigator = world.actors.find(actor => actor.id === 'avery')!;
  const action = { kind: 'investigate' as const, target: 'home-geiger', speech: '' };
  assert.equal(validateAction(world, investigator, action), '你还没有走到这个调查点附近。');
  investigator.position = { ...CLUE_POINTS['home-geiger']! };
  assert.equal(validateAction(world, investigator, action), null);
});

test('leaving a scene requires reaching its exit and commits a timed world action', () => {
  const world = createKillerWorld('test', 'avery', true);
  const investigator = world.actors.find(actor => actor.id === 'avery')!;
  const exit = EXIT_POINTS['hargrave-home']!.scrapyard!;
  const action = { kind: 'move' as const, target: 'scrapyard', speech: '' };
  assert.match(validateAction(world, investigator, action) ?? '', /出口/);
  investigator.position = { ...exit };
  assert.equal(validateAction(world, investigator, action), null);
  const decisions = decisionsFor(world); decisions.avery = { intent: '沿公路前往废品场。', action };
  const next = resolveRound(world, decisions, () => 50, action);
  assert.equal(next.round, 1);
  assert.equal(next.elapsedMinutes, world.elapsedMinutes + 30);
  assert.equal(next.actors.find(actor => actor.id === 'avery')?.locationId, 'scrapyard');
});

test('NPC supplies dialogue from its own AI proposal; persuasion alone never force-shares a known clue', () => {
  const world = createKillerWorld('test', 'avery', true);
  const player = world.actors.find(actor => actor.id === 'avery')!;
  const hargrave = world.actors.find(actor => actor.id === 'hargrave')!;
  player.position = { x: hargrave.position!.x - 20, y: hargrave.position!.y + 2 };
  const action = { kind: 'talk' as const, target: 'hargrave', speech: '你愿意把仪器的记录给我看看吗？' };
  const decisions = decisionsFor(world);
  decisions.avery = { intent: '询问屋里的仪器记录。', action };
  decisions.hargrave = { intent: '审慎回答，不贸然交出记录。', action: { kind: 'rest', speech: '' }, reply: '我先听听你们看到了什么，再决定该公开哪些材料。' };
  const next = resolveRound(world, decisions, () => 1, action);
  assert.ok(next.history[1]!.events.some(event => event.kind === 'dialogue' && event.text.includes('再决定该公开哪些材料')));
  assert.equal(next.actors.find(actor => actor.id === 'avery')?.knownClues.includes('home-geiger'), false);
});

test('nightfall and radio milestones follow elapsed in-world time, not the number of API calls', () => {
  const world = createKillerWorld('test', 'avery', true);
  world.elapsedMinutes = 18 * 60 + 50;
  const decisions = decisionsFor(world);
  const rest = decisions.avery!.action;
  const next = resolveRound(world, decisions, () => 50, rest);
  assert.equal(next.elapsedMinutes, 19 * 60 + 50);
  assert.equal(next.danger, 2);
  assert.ok(next.history[1]!.events.some(event => event.text.includes('夜幕降临')));
  const morning = createKillerWorld('morning', 'avery', true);
  morning.elapsedMinutes = 5 * 60 + 50;
  const morningRound = resolveRound(morning, decisionsFor(morning), () => 50, rest);
  assert.ok(morningRound.history[1]!.events.some(event => event.text.includes('全面隔离')));
});

