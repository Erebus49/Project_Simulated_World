// Run with the reviewed agent-world repository as CWD, after building core/world/memory.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const load = path => import(pathToFileURL(resolve(path)).href);
const { Engine, definePlugin, SnapshotPlugin, ConversationPlugin, IdleBrainPlugin } = await load('packages/core/dist/index.js');
const { GridWorldPlugin } = await load('packages/world/dist/index.js');
const { SimpleMemoryPlugin } = await load('packages/memory/dist/index.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const brain = think => ({ manifest: { name: 'review-brain', type: 'brain', version: '0', description: 'offline probe' }, async install() {}, think });

async function winner(delays) {
  const engine = new Engine({ maxTicks: 1, tickDelay: 0, parallelAgents: true, concurrency: 2, shuffleAgents: false, seed: 'fixed' });
  let stock = 1;
  const winners = [];
  await engine.use(definePlugin({ name: 'coffee-probe', type: 'world', install(ctx) {
    ctx.registerAction('buy', async id => {
      if (stock < 1) return { success: false, message: 'sold out' };
      stock--; winners.push(id); return { success: true };
    });
  } }));
  await engine.use(brain(async input => { await sleep(delays[input.agent.id]); return { innerThought: '', action: { type: 'buy' } }; }));
  await engine.spawnOne({ id: 'A', name: 'A' }); await engine.spawnOne({ id: 'B', name: 'B' });
  await engine.run();
  assert.equal(stock, 0);
  return winners[0];
}
const fastA = await winner({ A: 5, B: 40 });
const fastB = await winner({ A: 40, B: 5 });
assert.equal(fastA, 'A'); assert.equal(fastB, 'B');

const stopped = new Engine({ maxTicks: 1, tickDelay: 0, shuffleAgents: false });
let release, entered, acted = 0;
const pending = new Promise(resolve => { release = resolve; });
const started = new Promise(resolve => { entered = resolve; });
await stopped.use(definePlugin({ name: 'stop-world', type: 'world', install(ctx) {
  ctx.registerAction('buy', async () => { acted++; return { success: true }; });
} }));
await stopped.use(brain(async () => { entered(); await pending; return { innerThought: '', action: { type: 'buy' } }; }));
await stopped.spawnOne({ name: 'Late responder' });
const running = stopped.run(); await started; await stopped.stop(); release(); await running;
assert.equal(acted, 1);

const grid = new Engine({ maxTicks: 1, tickDelay: 0, shuffleAgents: false });
let leaked = false;
await grid.use(new GridWorldPlugin({ width: 4, height: 4, terrainGenerator: () => 'plains' }));
await grid.use(brain(async input => {
  if (input.agent.id === 'A') leaked = JSON.stringify(input.perceptions).includes('PRIVATE-GOAL-SECRET');
  return { innerThought: '', action: { type: 'idle' } };
}));
await grid.spawnOne({ id: 'A', name: 'A', meta: { position: { x: 1, y: 1 } } });
await grid.spawnOne({ id: 'B', name: 'B', traits: { privateGoal: 'PRIVATE-GOAL-SECRET' }, meta: { position: { x: 2, y: 1 } } });
await grid.run(); assert.equal(leaked, true);

const snapEngine = new Engine({ maxTicks: 1, tickDelay: 0, shuffleAgents: false });
const snapshots = new SnapshotPlugin();
await snapEngine.use(new IdleBrainPlugin());
await snapEngine.use(definePlugin({ name: 'idle-world', type: 'world', install(ctx) { ctx.registerAction('idle', async () => ({ success: true })); } }));
await snapEngine.use(snapshots);
await snapEngine.use(definePlugin({ name: 'late-economy', install(ctx) {
  ctx.bus.on('tick:after', () => ctx.updateAgent('A', agent => { agent.stats.money = 9; }));
} }));
await snapEngine.spawnOne({ id: 'A', name: 'A', stats: { money: 0 } }); await snapEngine.run();
const recordedMoney = snapshots.getSnapshot(0).agents[0].stats.money;
assert.equal(recordedMoney, 0); assert.equal(snapEngine.agents.get('A').stats.money, 9);

const chat = new Engine({ maxTicks: 1, tickDelay: 0, shuffleAgents: false });
let heardInSameTick = false, outsiderHeard = false;
await chat.use(new ConversationPlugin()); await chat.use(new SimpleMemoryPlugin());
await chat.use(definePlugin({ name: 'chat-world', type: 'world', install(ctx) { ctx.registerAction('idle', async () => ({ success: true })); } }));
await chat.use(brain(async input => {
  if (input.agent.id === 'B') heardInSameTick = JSON.stringify(input.memories).includes('PRIVATE-WHISPER');
  if (input.agent.id === 'C') outsiderHeard = JSON.stringify(input.memories).includes('PRIVATE-WHISPER');
  return { innerThought: '', action: { type: 'idle' }, ...(input.agent.id === 'A' ? { speech: { targets: ['B'], message: 'PRIVATE-WHISPER' } } : {}) };
}));
for (const id of ['A', 'B', 'C']) await chat.spawnOne({ id, name: id });
await chat.run(); assert.equal(heardInSameTick, true); assert.equal(outsiderHeard, false);

console.log(JSON.stringify({
  latencyChangesWinner: { fastA, fastB }, actionExecutedAfterStop: acted,
  gridExposesOtherTraitsWithoutPrivateFieldFilter: leaked,
  snapshotBeforeLaterTickEffect: { recordedMoney, finalMoney: snapEngine.agents.get('A').stats.money },
  directedMessage: { recipientSeesInSameTick: heardInSameTick, outsiderSees: outsiderHeard },
  probesConfirmed: 5,
}, null, 2));
