import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentConfig, CoffeeConfig, DecisionResult, DeepReadonly, WorldEvent, WorldState } from '../shared/types.js';
import { parseDecision } from '../shared/validation.js';
import { coffeeConfig } from '../scenarios/coffeeTown.js';
import { MockDecisionProvider } from '../agents/mock.js';
import { WorldRuntime } from '../engine/runtime.js';
import { EventJournal, replay } from '../engine/events.js';
import { createCoffeeWorld } from '../scenarios/coffeeTown.js';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const wait = (durationTicks = 3): DecisionResult => ({ type: 'wait', params: { durationTicks } });
const buy = (maxUnitPrice = 6): DecisionResult => ({ type: 'buy', params: { shopId: 'coffee', quantity: 1, maxUnitPrice } });
function agents(count = 3): AgentConfig[] {
  return coffeeConfig({ agentCount: count }).agents.map(agent => ({ ...agent, locationId: 'cafe' }));
}
function config(overrides: Partial<CoffeeConfig> = {}): Partial<CoffeeConfig> {
  return { runId: 'unit-world', agents: agents(), ...overrides };
}
function totalMoney(world: DeepReadonly<WorldState>) { return Object.values(world.agents).reduce((sum, agent) => sum + agent.money, 0); }
function cups(world: DeepReadonly<WorldState>) { return Object.values(world.agents).reduce((sum, agent) => sum + (agent.inventory.coffee ?? 0), 0); }
function returnedWaits() { return new MockDecisionProvider(() => wait()); }
function privateMessages(events: DeepReadonly<WorldEvent[]>) { return events.filter(event => event.type === 'message_received'); }

test('paused advance does nothing; single-step advances exactly one tick and pauses', async () => {
  const runtime = new WorldRuntime(returnedWaits(), config());
  const initial = runtime.snapshot();
  await runtime.advance(); assert.deepEqual(runtime.snapshot(), initial);
  await runtime.step(); assert.equal(runtime.snapshot().tick, 1); assert.equal(runtime.snapshot().status, 'paused');
  runtime.start(); await runtime.advance(); assert.equal(runtime.snapshot().tick, 2);
  runtime.pause(); await runtime.advance(); assert.equal(runtime.snapshot().tick, 2);
});

test('3-agent deterministic mock completes movement, paid work and purchase', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(), { agentCount: 3 });
  const initialMoney = totalMoney(runtime.snapshot());
  for (let tick = 0; tick < 9; tick++) await runtime.step();
  const world = runtime.snapshot();
  assert.equal(world.agents['customer-a']!.locationId, 'cafe');
  assert.equal(world.agents['customer-a']!.inventory.coffee, 1);
  assert.ok(world.agents.barista!.money > 18);
  assert.equal(totalMoney(world), initialMoney + world.metrics.workIncomeCreated);
  assert.equal(world.shops.coffee!.stock + cups(world), 12);
});

test('last cup never oversells or creates money; rejected purchase has no financial effect', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ? wait() : buy()), config({ initialStock: 1 }));
  const before = runtime.snapshot();
  const batch = await runtime.step(), after = runtime.snapshot();
  assert.equal(after.shops.coffee!.stock, 0); assert.equal(cups(after), 1);
  assert.equal(totalMoney(after), totalMoney(before));
  assert.equal(batch.outcomes.filter(result => result.type === 'buy' && result.accepted).length, 1);
  assert.equal(batch.outcomes.find(result => result.agentId === 'customer-a')?.reason, 'insufficient_stock');
  assert.equal(after.agents['customer-a']!.money, before.agents['customer-a']!.money);
});

test('same proposal set settles identically with reversed response completion order', async () => {
  async function run(slowId: string) {
    const runtime = new WorldRuntime(new MockDecisionProvider(async observation => {
      await sleep(observation.self.id === slowId ? 12 : 1);
      return observation.self.id === 'owner' ? wait() : buy();
    }), config({ initialStock: 1 }), { maxConcurrency: 3 });
    await runtime.step(); return runtime.archive();
  }
  assert.deepEqual(await run('barista'), await run('customer-a'));
});

test('resource priority rotates with tick rather than provider timing', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => {
    if (observation.tick === 1) return wait(2);
    return observation.self.id === 'owner' ? wait() : buy();
  }), config({ initialStock: 1 }));
  await runtime.step(); await runtime.step(); await runtime.step();
  assert.equal(runtime.snapshot().agents['customer-a']!.inventory.coffee, 1);
  assert.equal(runtime.snapshot().agents.barista!.inventory.coffee ?? 0, 0);
});

test('same-batch price change and buy recheck maxUnitPrice at settlement', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'set_price', params: { shopId: 'coffee', unitPrice: 10 } } : buy(6)), config());
  const before = runtime.snapshot(), batch = await runtime.step();
  assert.equal(runtime.snapshot().shops.coffee!.unitPrice, 10);
  assert.equal(runtime.snapshot().shops.coffee!.stock, before.shops.coffee!.stock);
  assert.equal(totalMoney(runtime.snapshot()), totalMoney(before));
  assert.equal(batch.outcomes.filter(outcome => outcome.reason === 'price_exceeds_limit').length, 2);
});

test('new price applies to a willing buyer and actual execution price is logged', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'set_price', params: { shopId: 'coffee', unitPrice: 8 } } : buy(9)), config());
  await runtime.step();
  const purchases = runtime.events().filter(event => event.type === 'purchase_completed');
  assert.equal(purchases.length, 2); assert.equal(purchases[0]!.payload.unitPrice, 8);
  assert.equal(runtime.snapshot().agents.owner!.money, 116);
});

test('not owner, bad price, insufficient funds and remote purchases are rejected', async () => {
  const definitions = agents(); definitions[1]!.money = 1; definitions[2]!.locationId = 'square';
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'set_price', params: { shopId: 'coffee', unitPrice: 100 } } : buy()), config({ agents: definitions }));
  const result = await runtime.step();
  assert.deepEqual(new Set(result.outcomes.map(outcome => outcome.reason)), new Set(['price_out_of_range', 'insufficient_money', 'shop_not_here']));
  const other = new WorldRuntime(new MockDecisionProvider(() => ({ type: 'set_price', params: { shopId: 'coffee', unitPrice: 4 } })), config());
  const next = await other.step(); assert.equal(next.outcomes.filter(outcome => outcome.reason === 'not_shop_owner').length, 2);
});

test('failed transaction candidate cannot partially debit money', () => {
  const journal = new EventJournal(createCoffeeWorld(coffeeConfig()));
  const before = journal.snapshot();
  assert.throws(() => journal.commit({ type: 'purchase_completed' }, state => {
    state.agents['customer-a']!.money -= 6;
    state.shops.coffee!.stock = -1;
  }), /Invariant/);
  assert.deepEqual(journal.snapshot(), before); assert.equal(journal.events().length, 0);
});

test('world snapshots and provider inputs are cloned and deeply frozen', async () => {
  let blocked = false;
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => {
    try { (observation.self.goals as string[]).push('mutated'); } catch { blocked = true; }
    return wait();
  }), config());
  const snapshot = runtime.snapshot();
  assert.throws(() => { (snapshot.agents.owner as unknown as { money: number }).money = -1; }, TypeError);
  await runtime.step(); assert.ok(blocked); assert.ok(!runtime.snapshot().agents.owner!.goals.includes('mutated'));
});

test('private goals, money, inventory and differences never enter another observation', () => {
  const definitions = agents(); definitions[0]!.goals = ['SECRET-OWNER-GOAL']; definitions[0]!.profile.description = 'SECRET-OWNER-PROFILE';
  const runtime = new WorldRuntime(returnedWaits(), config({ agents: definitions }));
  const own = JSON.stringify(runtime.observe('owner')), other = JSON.stringify(runtime.observe('barista'));
  assert.match(own, /SECRET-OWNER-GOAL/); assert.doesNotMatch(other, /SECRET-OWNER/);
  assert.equal('money' in runtime.observe('barista').nearbyAgents[0]!, false);
  assert.doesNotMatch(other, /differences|pendingExternalCommands|snapshotHash/);
});

test('injected rumor appears only for recipient and never changes real price', async () => {
  const runtime = new WorldRuntime(returnedWaits(), config());
  runtime.enqueueCommand({ commandId: 'rumor-1', type: 'inject_message', recipientId: 'barista', content: 'SECRET-RUMOR: tomorrow price 100' });
  assert.doesNotMatch(JSON.stringify(runtime.observe('barista')), /SECRET-RUMOR/);
  await runtime.step();
  assert.match(JSON.stringify(runtime.observe('barista')), /SECRET-RUMOR/);
  assert.doesNotMatch(JSON.stringify(runtime.observe('owner')), /SECRET-RUMOR/);
  assert.equal(runtime.snapshot().shops.coffee!.unitPrice, 6);
  assert.equal(runtime.snapshot().agents.barista!.beliefs[0]!.kind, 'reported_claim');
});

test('same-batch message becomes recipient knowledge no earlier than next tick', async () => {
  const observed: string[] = [];
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => {
    if (observation.self.id === 'owner') return { type: 'send_message', params: { targetId: 'barista', content: 'NEXT-BATCH-ONLY' } };
    if (observation.self.id === 'barista') observed.push(JSON.stringify(observation));
    return wait(1);
  }), config());
  await runtime.step();
  assert.doesNotMatch(observed[0]!, /NEXT-BATCH-ONLY/);
  assert.equal(privateMessages(runtime.events()).length, 0);
  assert.doesNotMatch(JSON.stringify(runtime.observe('barista')), /NEXT-BATCH-ONLY/);
  await runtime.step(); assert.match(JSON.stringify(runtime.observe('barista')), /NEXT-BATCH-ONLY/);
  assert.doesNotMatch(JSON.stringify(runtime.observe('customer-a')), /NEXT-BATCH-ONLY/);
});

test('retelling preserves immutable sent/received/source event chain', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => {
    if (observation.self.id === 'barista' && observation.inbox[0]) return { type: 'send_message', params: { targetId: 'owner', content: 'A retelling' }, sourceEventIds: [observation.inbox[0].eventId] };
    return wait(1);
  }), config());
  runtime.enqueueCommand({ commandId: 'source', type: 'inject_message', recipientId: 'barista', content: 'Original unverified claim' });
  await runtime.step();
  const sent = runtime.events().find(event => event.type === 'message_sent')!;
  const source = runtime.events().find(event => event.type === 'rumor_injected')!;
  assert.deepEqual(sent.sourceEventIds, [source.eventId]);
  await runtime.step();
  const received = runtime.events().find(event => event.type === 'message_received')!;
  assert.deepEqual(received.sourceEventIds, [sent.eventId]);
  assert.equal(runtime.snapshot().agents.owner!.inbox[0]!.kind, 'retelling');
  assert.equal(source.payload.content, 'Original unverified claim');
});

test('forged and private-unseen source references are rejected', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'send_message', params: { targetId: 'barista', content: 'forged' }, sourceEventIds: ['unit-world:e3'] } : wait()), config());
  runtime.enqueueCommand({ commandId: 'secret', type: 'inject_message', recipientId: 'barista', content: 'private to barista' });
  const batch = await runtime.step();
  const actualPrivateId = runtime.events().find(event => event.type === 'rumor_injected')!.eventId;
  assert.equal(actualPrivateId, 'unit-world:e3');
  assert.equal(batch.outcomes.find(outcome => outcome.agentId === 'owner')?.reason, 'source_not_seen');
  assert.equal(runtime.snapshot().metrics.messagesSent, 0);
});

test('message reachability requires co-location or a direct configured contact', async () => {
  const definitions = agents(); definitions[0]!.locationId = 'market'; definitions[0]!.relationshipIds = [];
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'send_message', params: { targetId: 'barista', content: 'unreachable' } } : wait()), config({ agents: definitions }));
  const batch = await runtime.step();
  assert.equal(batch.outcomes.find(outcome => outcome.agentId === 'owner')?.reason, 'recipient_unreachable');
  assert.equal(runtime.snapshot().agents.owner!.speechCount, 0);
});

test('work and move finish at due simulation tick, not while a batch is waiting', async () => {
  const definitions = agents(); definitions[1]!.workLocationIds = ['cafe'];
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => {
    if (observation.tick > 1) return wait();
    if (observation.self.id === 'barista') return { type: 'work', params: { durationTicks: 2 } };
    if (observation.self.id === 'customer-a') return { type: 'move', params: { destinationId: 'square' } };
    return wait();
  }), config({ agents: definitions }));
  await runtime.step(); assert.equal(runtime.snapshot().agents.barista!.money, 18);
  await runtime.step(); assert.equal(runtime.snapshot().agents['customer-a']!.locationId, 'cafe');
  await runtime.step(); assert.equal(runtime.snapshot().agents['customer-a']!.locationId, 'square');
  assert.equal(runtime.snapshot().agents.barista!.money, 22);
});

test('durations, workplaces and movement edges are enforced by code', async () => {
  const definitions = agents(); definitions[1]!.workLocationIds = ['market'];
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'wait', params: { durationTicks: 7 } } : observation.self.id === 'barista' ?
      { type: 'work', params: { durationTicks: 2 } } : { type: 'move', params: { destinationId: 'market' } }), config({ agents: definitions }));
  const batch = await runtime.step();
  assert.deepEqual(new Set(batch.outcomes.map(outcome => outcome.reason)), new Set(['duration_exceeds_limit', 'workplace_not_allowed', 'destination_not_adjacent']));
});

test('invalid output, unknown action and identity injection use deterministic fallback', async () => {
  const invalid: unknown[] = ['{not-json}', { type: 'execute_code', params: { code: 'bad' } }, { type: 'wait', params: { durationTicks: 1 }, agentId: 'owner' }];
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => invalid[observation.self.id === 'owner' ? 0 : observation.self.id === 'barista' ? 1 : 2]), config());
  await runtime.step();
  assert.equal(runtime.snapshot().metrics.decisionFallbacks, 3);
  assert.equal(runtime.snapshot().scheduledTasks.length, 3);
  assert.equal(runtime.events().filter(event => event.type === 'action_rejected').length, 3);
  assert.ok(runtime.snapshot().scheduledTasks.every(task => task.type === 'wait' && task.dueTick === 2));
});

test('batch barrier freezes tick, rejects duplicate stepping and bounds concurrency', async () => {
  let active = 0, maximum = 0;
  const runtime = new WorldRuntime(new MockDecisionProvider(async () => {
    active++; maximum = Math.max(maximum, active); await sleep(8); active--; return wait();
  }), { agentCount: 8 }, { maxConcurrency: 3 });
  const operation = runtime.step(); await sleep(3);
  assert.equal(runtime.snapshot().tick, 1); assert.equal(runtime.snapshot().status, 'deciding');
  await assert.rejects(runtime.step(), /already in flight/);
  await operation; assert.equal(maximum, 3); assert.equal(runtime.snapshot().tick, 1);
  assert.equal(new Set(runtime.jobs().map(job => job.agentId)).size, 8);
});

test('request timeout does not hang a batch even when the provider ignores abort', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ? new Promise(() => {}) : wait()), config(), { requestTimeoutMs: 8, batchTimeoutMs: 100 });
  await runtime.step();
  assert.equal(runtime.snapshot().status, 'paused');
  assert.equal(runtime.snapshot().metrics.decisionFallbacks, 1);
  assert.ok(runtime.events().some(event => event.payload.reason === 'request_timeout'));
});

test('uncooperative timed-out providers continue occupying bounded slots across ticks', async () => {
  let calls = 0;
  const runtime = new WorldRuntime(new MockDecisionProvider(() => { calls++; return new Promise(() => {}); }), { agentCount: 8 }, { maxConcurrency: 2, requestTimeoutMs: 4, batchTimeoutMs: 60 });
  for (let tick = 0; tick < 4; tick++) await runtime.step();
  assert.equal(calls, 2); assert.equal(runtime.executionStatus().outstandingProviderCalls, 2);
  assert.equal(runtime.snapshot().tick, 4);
  assert.ok(runtime.events().some(event => event.payload.reason === 'provider_slots_still_occupied'));
});

test('batch deadline also releases hung and queued jobs', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(() => new Promise(() => {})), config(), { maxConcurrency: 1, requestTimeoutMs: 200, batchTimeoutMs: 8 });
  await runtime.step();
  assert.equal(runtime.snapshot().metrics.decisionFallbacks, 3);
  assert.equal(runtime.snapshot().metrics.decisionsRequested, 1);
  assert.equal(runtime.snapshot().status, 'paused');
});

test('pause during decisions settles this batch but never advances another tick', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(async () => { await sleep(10); return wait(); }), config());
  runtime.start(); const operation = runtime.advance(); await sleep(2); runtime.pause();
  await operation;
  assert.equal(runtime.snapshot().status, 'paused'); assert.equal(runtime.snapshot().tick, 1);
  await runtime.advance(); assert.equal(runtime.snapshot().tick, 1);
});

test('cancelled and reset runs discard late provider results without state changes', async () => {
  let release: ((value: DecisionResult) => void) | undefined;
  const blocked = new Promise<DecisionResult>(resolve => { release = resolve; });
  const runtime = new WorldRuntime(new MockDecisionProvider(() => blocked), config());
  const operation = runtime.step(); await sleep(1); runtime.cancel();
  const stopped = runtime.snapshot();
  assert.equal((await operation).cancelled, true);
  release!(buy()); await sleep(2); assert.deepEqual(runtime.snapshot(), stopped);
  runtime.reset(); assert.notEqual(runtime.snapshot().runId, stopped.runId); assert.equal(runtime.snapshot().tick, 0);
});

test('reset during an in-flight batch prevents old results entering a new run', async () => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const runtime = new WorldRuntime(new MockDecisionProvider(async () => { await blocked; return buy(); }), config());
  const operation = runtime.step(); await sleep(1); runtime.reset(); const initial = runtime.snapshot();
  release!(); assert.equal((await operation).cancelled, true); await sleep(1);
  assert.deepEqual(runtime.snapshot(), initial); assert.equal(runtime.events().length, 1);
});

test('reset can create a new 3-agent configuration without losing the run boundary', () => {
  const runtime = new WorldRuntime(returnedWaits());
  runtime.reset({ agentCount: 3 });
  assert.equal(runtime.snapshot().agentOrder.length, 3);
  assert.equal(runtime.snapshot().status, 'paused');
  assert.notEqual(runtime.snapshot().runId, 'coffee-417');
});

test('commands queued during decisions are invisible until the next control boundary', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(async () => { await sleep(8); return wait(); }), config());
  const operation = runtime.step(); await sleep(1);
  runtime.enqueueCommand({ commandId: 'later', type: 'inject_message', recipientId: 'owner', content: 'CONTROL-BOUNDARY-SECRET' });
  assert.doesNotMatch(JSON.stringify(runtime.snapshot()), /CONTROL-BOUNDARY-SECRET/);
  await operation; assert.equal(runtime.snapshot().agents.owner!.inbox.length, 0);
  await runtime.step(); assert.equal(runtime.snapshot().agents.owner!.inbox[0]!.content, 'CONTROL-BOUNDARY-SECRET');
});

test('injection is idempotent; unknown recipients become logged rejection', async () => {
  const runtime = new WorldRuntime(returnedWaits(), config());
  const command = { commandId: 'same', type: 'inject_message', recipientId: 'owner', content: 'once' };
  assert.equal(runtime.enqueueCommand(command), true); assert.equal(runtime.enqueueCommand(command), false);
  runtime.enqueueCommand({ commandId: 'unknown', type: 'inject_message', recipientId: '__proto__', content: 'reject' });
  await runtime.step();
  assert.equal(runtime.snapshot().agents.owner!.inbox.length, 1);
  assert.equal(runtime.events().filter(event => event.type === 'command_rejected').length, 1);
});

test('cooldown and active short actions prevent per-tick calls', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(() => wait(5)), config({ decisionCooldownTicks: 2 }));
  await runtime.step();
  for (let tick = 0; tick < 4; tick++) await runtime.step();
  assert.equal(runtime.snapshot().metrics.decisionsRequested, 3);
  await runtime.step(); assert.equal(runtime.snapshot().metrics.decisionsRequested, 6);
});

test('budget exhaustion continues simulation using wait, without more provider calls', async () => {
  let calls = 0;
  const runtime = new WorldRuntime(new MockDecisionProvider(() => { calls++; return wait(1); }), config({ maxDecisionsPerRun: 2 }));
  for (let tick = 0; tick < 6; tick++) await runtime.step();
  assert.equal(calls, 2); assert.equal(runtime.snapshot().metrics.decisionsRequested, 2);
  assert.ok(runtime.events().some(event => event.payload.reason === 'decision_budget_exhausted'));
  assert.equal(runtime.snapshot().tick, 6);
});

test('speech ceiling is enforced and resets by simulated day, rejected sends do not count', async () => {
  const runtime = new WorldRuntime(new MockDecisionProvider(observation => observation.self.id === 'owner' ?
    { type: 'send_message', params: { targetId: 'barista', content: 'one counted delivery' } } : wait(1)), config({ speechLimit: 1, ticksPerDay: 4, decisionCooldownTicks: 1 }));
  await runtime.step(); assert.equal(runtime.snapshot().agents.owner!.speechCount, 1);
  const second = await runtime.step(); assert.equal(second.outcomes.find(outcome => outcome.agentId === 'owner')?.reason, 'speech_limit_exceeded');
  assert.equal(runtime.snapshot().agents.owner!.speechCount, 1);
  await runtime.step(); await runtime.step();
  assert.equal(runtime.snapshot().agents.owner!.dayIndex, 1); assert.equal(runtime.snapshot().agents.owner!.speechCount, 1);
  assert.equal(runtime.snapshot().metrics.messagesSent, 2);
});

test('fixed mock run and complete event log repeat identically; replay restores pending tasks and inboxes', async () => {
  async function run() {
    const runtime = new WorldRuntime(new MockDecisionProvider(), { runId: 'repeatable', seed: 417 });
    runtime.enqueueCommand({ commandId: 'repeat-rumor', type: 'inject_message', recipientId: 'messenger', content: '明天可能涨价，尚未证实' });
    for (let tick = 0; tick < 10; tick++) await runtime.step();
    return runtime.archive();
  }
  const first = await run(); assert.deepEqual(first, await run());
  assert.deepEqual(replay(first.initialState, first.events), first.finalState);
  const copy = structuredClone(first.events); copy[0]!.eventSeq = 999;
  assert.throws(() => replay(first.initialState, copy), /sequence/);
});

test('replay detects edited before-state instead of silently inventing history', async () => {
  const runtime = new WorldRuntime(returnedWaits(), config()); await runtime.step();
  const archive = runtime.archive();
  archive.events[0]!.differences[0]!.before = 'tampered';
  assert.throws(() => replay(archive.initialState, archive.events), /before-state/);
});

test('strict schemas reject nonfinite values, unknown params and excessive work duration', () => {
  assert.throws(() => parseDecision({ type: 'buy', params: { shopId: 'coffee', quantity: -1, maxUnitPrice: 6 } }));
  assert.throws(() => parseDecision({ type: 'buy', params: { shopId: 'coffee', quantity: 1, maxUnitPrice: NaN } }));
  assert.throws(() => parseDecision({ type: 'work', params: { durationTicks: 500 } }));
  assert.throws(() => parseDecision({ type: 'wait', params: { durationTicks: 1, money: 999 } }));
});
