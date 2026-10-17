import type { AgentConfig, CoffeeConfig, WorldState } from '../shared/types.js';
import { clone, integer, string } from '../shared/validation.js';

const DEFINITIONS: AgentConfig[] = [
  { id: 'owner', name: '阿栗', profile: { role: 'owner', description: '经营松果咖啡，希望维持利润，也在意老顾客。', shareRumors: false }, goals: ['让店铺维持经营', '根据自己掌握的信息决定是否调价'], locationId: 'cafe', money: 100, inventory: {}, relationshipIds: ['barista', 'messenger', 'supplier'], workLocationIds: ['cafe'] },
  { id: 'barista', name: '小周', profile: { role: 'barista', description: '认真工作的店员，只知道自己收到的消息。', shareRumors: true }, goals: ['完成工作获得收入'], locationId: 'cafe', money: 18, inventory: {}, relationshipIds: ['owner', 'customer-a'], workLocationIds: ['cafe'] },
  { id: 'customer-a', name: '林岚', profile: { role: 'customer', description: '想买一杯咖啡，对价格比较敏感。', shareRumors: true }, goals: ['在报价范围内购买一杯咖啡'], locationId: 'square', money: 30, inventory: {}, relationshipIds: ['customer-b', 'barista', 'messenger'], workLocationIds: ['square'] },
  { id: 'customer-b', name: '陈默', profile: { role: 'customer', description: '喜欢到店观察，不会自动相信传闻。', shareRumors: false }, goals: ['购买一杯咖啡'], locationId: 'square', money: 24, inventory: {}, relationshipIds: ['customer-a'], workLocationIds: ['square'] },
  { id: 'supplier', name: '老何', profile: { role: 'supplier', description: '在集市工作，与咖啡店主保持联系。', shareRumors: true }, goals: ['通过本地工作赚取收入'], locationId: 'market', money: 20, inventory: {}, relationshipIds: ['owner', 'messenger'], workLocationIds: ['market'] },
  { id: 'messenger', name: '小满', profile: { role: 'messenger', description: '喜欢交流，有几位熟识的联系人。', shareRumors: true }, goals: ['向可达联系人转述收到的消息，保留来源'], locationId: 'square', money: 12, inventory: {}, relationshipIds: ['owner', 'supplier', 'customer-a'], workLocationIds: ['square'] },
  { id: 'visitor', name: '许宁', profile: { role: 'customer', description: '来镇上的临时访客。', shareRumors: false }, goals: ['买一杯咖啡'], locationId: 'market', money: 15, inventory: {}, relationshipIds: ['supplier'], workLocationIds: ['market'] },
  { id: 'neighbor', name: '苏禾', profile: { role: 'customer', description: '有空会来广场的居民。', shareRumors: true }, goals: ['量入为出地购买咖啡'], locationId: 'square', money: 21, inventory: {}, relationshipIds: ['customer-b'], workLocationIds: ['square'] },
];

export function coffeeConfig(overrides: Partial<CoffeeConfig> & { agentCount?: number } = {}): CoffeeConfig {
  const count = integer(overrides.agentCount ?? overrides.agents?.length ?? 6, 'agentCount', 3, 8);
  const agents = clone(overrides.agents ?? DEFINITIONS.slice(0, count));
  const ids = new Set(agents.map(agent => agent.id));
  if (ids.size !== agents.length || agents.length < 3 || agents.length > 8) throw new Error('scenario requires 3–8 unique agents');
  for (const agent of agents) {
    string(agent.id, 'agent.id'); string(agent.name, 'agent.name');
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(agent.id) || ['constructor', 'prototype'].includes(agent.id)) throw new Error('agent.id must be a safe lowercase identifier');
    integer(agent.money, 'agent.money', 0, 1_000_000);
    if (!['cafe', 'square', 'market'].includes(agent.locationId)) throw new Error('unknown initial location');
    if (agent.workLocationIds.some(id => !['cafe', 'square', 'market'].includes(id))) throw new Error('unknown work location');
    Object.values(agent.inventory).forEach(value => integer(value, 'inventory quantity', 0, 1_000_000));
    agent.relationshipIds = [...new Set(agent.relationshipIds.filter(id => ids.has(id) && id !== agent.id))];
  }
  if (!ids.has('owner')) throw new Error('the coffee shop requires the owner agent');
  const config: CoffeeConfig = {
    runId: overrides.runId ?? `coffee-${overrides.seed ?? 417}`, seed: overrides.seed ?? 417, agents,
    ticksPerDay: overrides.ticksPerDay ?? 24, decisionCooldownTicks: overrides.decisionCooldownTicks ?? 2,
    maxDecisionsPerRun: overrides.maxDecisionsPerRun ?? 120, movementDurationTicks: overrides.movementDurationTicks ?? 2,
    maxDurationTicks: overrides.maxDurationTicks ?? 6, wagePerTick: overrides.wagePerTick ?? 2,
    minUnitPrice: overrides.minUnitPrice ?? 1, maxUnitPrice: overrides.maxUnitPrice ?? 20,
    initialUnitPrice: overrides.initialUnitPrice ?? 6, initialStock: overrides.initialStock ?? 12,
    speechLimit: overrides.speechLimit ?? null,
    ...(overrides.setting ? { setting: clone(overrides.setting) } : {}),
    ...(overrides.sceneObjects ? {sceneObjects:clone(overrides.sceneObjects)} : {}),
    ...(overrides.skillDefinitions ? {skillDefinitions:clone(overrides.skillDefinitions)} : {}),
  };
  string(config.runId, 'runId', 80);
  integer(config.seed, 'seed', 0, 2 ** 32 - 1);
  integer(config.ticksPerDay, 'ticksPerDay', 1, 100_000);
  integer(config.decisionCooldownTicks, 'decisionCooldownTicks', 1, 1000);
  integer(config.maxDecisionsPerRun, 'maxDecisionsPerRun', 0, 100_000);
  integer(config.maxDurationTicks, 'maxDurationTicks', 1, 100);
  integer(config.movementDurationTicks, 'movementDurationTicks', 1, config.maxDurationTicks);
  integer(config.wagePerTick, 'wagePerTick', 0, 10_000);
  integer(config.minUnitPrice, 'minUnitPrice', 1, 1_000_000);
  integer(config.maxUnitPrice, 'maxUnitPrice', config.minUnitPrice, 1_000_000);
  integer(config.initialUnitPrice, 'initialUnitPrice', config.minUnitPrice, config.maxUnitPrice);
  integer(config.initialStock, 'initialStock', 0, 1_000_000);
  if (config.speechLimit !== null) integer(config.speechLimit, 'speechLimit', 0, 1000);
  return config;
}

export function createCoffeeWorld(config: CoffeeConfig): WorldState {
  const { agents, ...limits } = clone(config);
  return {
    runId: config.runId, schemaVersion: 3, worldVersion: 0, tick: 0, seed: config.seed, status: 'paused',
    agentOrder: agents.map(agent => agent.id),
    agents: Object.fromEntries(agents.map(agent => [agent.id, { ...agent, mode: 'idle', plan: [], currentAction: null,
      nextDecisionTick: 1, lastDecisionTick: null, inbox: [], beliefs: [], recentMemory: [], seenEventIds: [],
      speechCount: 0, dayIndex: 0, dirtyReasons: ['initial'] }])),
    locations: {
      cafe: { id: 'cafe', name: '松果咖啡', neighborIds: ['square'] },
      square: { id: 'square', name: '小镇广场', neighborIds: ['cafe', 'market'] },
      market: { id: 'market', name: '集市', neighborIds: ['square'] },
    },
    shops: { coffee: { id: 'coffee', name: '松果咖啡', locationId: 'cafe', ownerId: 'owner', unitPrice: config.initialUnitPrice, stock: config.initialStock } },
    rules: { speech: { id: 'speech', type: 'speech_limit', enabled: config.speechLimit !== null, dailyLimit: config.speechLimit ?? 0, effectiveTick: 0 } },
    scheduledTasks: [], pendingEvents: [], pendingExternalCommands: [],
    ...(config.sceneObjects?{sceneObjects:Object.fromEntries(clone(config.sceneObjects).map(object=>[object.id,object]))}:{}),
    metrics: { decisionsRequested: 0, decisionFallbacks: 0, batches: 0, acceptedActions: 0, rejectedActions: 0, transactions: 0, messagesSent: 0, workIncomeCreated: 0 },
    config: limits,
  };
}
