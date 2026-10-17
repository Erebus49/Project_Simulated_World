import type { AgentObservation, DeepReadonly, VisibleEvent, WorldEvent, WorldState } from '../shared/types.js';
import { clone, deepFreeze } from '../shared/validation.js';

export function isReachable(world: DeepReadonly<WorldState>, from: string, to: string): boolean {
  const sender = Object.hasOwn(world.agents, from) ? world.agents[from] : undefined;
  const recipient = Object.hasOwn(world.agents, to) ? world.agents[to] : undefined;
  return !!sender && !!recipient && from !== to &&
    (sender.locationId === recipient.locationId || sender.relationshipIds.includes(to));
}

function visibleRecord(event: DeepReadonly<WorldEvent>): VisibleEvent {
  // Never expose differences: they can contain another character's private state.
  return { eventId: event.eventId, eventSeq: event.eventSeq, runId: event.runId, tick: event.tick,
    batchId: event.batchId, actorId: event.actorId, type: event.type, sourceEventIds: [...event.sourceEventIds],
    payload: JSON.parse(JSON.stringify(event.payload)) as VisibleEvent['payload'] };
}

export function buildObservation(world: DeepReadonly<WorldState>, events: DeepReadonly<WorldEvent[]>, agentId: string, batchId: string): DeepReadonly<AgentObservation> {
  const agent = Object.hasOwn(world.agents, agentId) ? world.agents[agentId] : undefined;
  if (!agent) throw new Error('Unknown observer');
  const seen = new Set(agent.seenEventIds), memory = new Set(agent.recentMemory);
  const visible = events.filter(event => seen.has(event.eventId) &&
    (event.visibility.type === 'public' || event.visibility.recipientIds.includes(agentId)));
  const observation: DeepReadonly<AgentObservation> = {
    ...(world.config.setting ? { setting: world.config.setting } : {}),
    runId: world.runId, batchId, snapshotVersion: world.worldVersion, tick: world.tick, dayIndex: agent.dayIndex,
    self: clone({ id: agent.id, name: agent.name, profile: agent.profile, goals: agent.goals,
      locationId: agent.locationId, money: agent.money, inventory: agent.inventory, plan: agent.plan,
      currentAction: agent.currentAction, speechCount: agent.speechCount, workLocationIds: agent.workLocationIds,...(agent.position?{position:agent.position}:{}) }),
    nearbyAgents: world.agentOrder.filter(id => id !== agentId && world.agents[id]?.locationId === agent.locationId)
      .map(id => ({ id, name: world.agents[id]!.name, mode: world.agents[id]!.mode })),
    reachableAgentIds: world.agentOrder.filter(id => isReachable(world, agentId, id)),
    locations: clone(Object.values(world.locations)),
    shops: Object.values(world.shops).map(shop => ({ id: shop.id, name: shop.name, ownerId: shop.ownerId,
      locationId: shop.locationId, unitPrice: shop.unitPrice, stock: shop.locationId === agent.locationId ? shop.stock : null })),
    rules: clone(Object.values(world.rules)), inbox: clone(agent.inbox), beliefs: clone(agent.beliefs),
    recentMemory: visible.filter(event => memory.has(event.eventId)).map(visibleRecord),
    newEvents: visible.filter(event => event.tick > (agent.lastDecisionTick ?? -1) && memory.has(event.eventId)).map(visibleRecord),
    dirtyReasons: [...agent.dirtyReasons],
    limits: { minUnitPrice: world.config.minUnitPrice, maxUnitPrice: world.config.maxUnitPrice, maxDurationTicks: world.config.maxDurationTicks },
    ...(agent.character?{character:clone(agent.character),skills:clone((world.config.skillDefinitions??[]).filter(skill=>agent.character!.skillIds.includes(skill.id))),
      skillHistory:clone(agent.skillHistory??{}),objects:clone(Object.values(world.sceneObjects??{}).filter(object=>object.locationId===agent.locationId))}:{}),
  };
  return deepFreeze(observation);
}
