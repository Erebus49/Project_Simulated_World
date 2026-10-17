import type { WorldState } from '../shared/types.js';

function natural(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invariant violated: ${label} is not a nonnegative safe integer`);
}

/** Checked before every authoritative commit, not repaired by clamping. */
export function assertWorld(state: WorldState): void {
  natural(state.tick, 'tick'); natural(state.worldVersion, 'worldVersion');
  if (new Set(state.agentOrder).size !== state.agentOrder.length || Object.keys(state.agents).length !== state.agentOrder.length) throw new Error('Invariant violated: agentOrder');
  for (const id of state.agentOrder) {
    const agent = state.agents[id];
    if (!agent || agent.id !== id || !state.locations[agent.locationId]) throw new Error('Invariant violated: agent identity/location');
    natural(agent.money, `${id}.money`); natural(agent.speechCount, `${id}.speechCount`);
    Object.entries(agent.inventory).forEach(([item, amount]) => natural(amount, `${id}.inventory.${item}`));
    if (agent.currentAction && agent.currentAction.dueTick <= state.tick) throw new Error('Invariant violated: overdue currentAction');
  }
  for (const shop of Object.values(state.shops)) {
    if (!state.agents[shop.ownerId] || !state.locations[shop.locationId]) throw new Error('Invariant violated: shop owner/location');
    natural(shop.stock, `${shop.id}.stock`);
    if (!Number.isSafeInteger(shop.unitPrice) || shop.unitPrice < state.config.minUnitPrice || shop.unitPrice > state.config.maxUnitPrice) throw new Error('Invariant violated: shop price');
  }
  const tasks = new Set<string>();
  for (const task of state.scheduledTasks) {
    if (tasks.has(task.actorId) || !state.agents[task.actorId]) throw new Error('Invariant violated: duplicate/unknown task actor');
    tasks.add(task.actorId);
    if (task.dueTick <= state.tick || state.agents[task.actorId]?.currentAction?.intentId !== task.intentId) throw new Error('Invariant violated: task/action mismatch');
  }
  for (const agent of Object.values(state.agents)) {
    if (Boolean(agent.currentAction) !== tasks.has(agent.id)) throw new Error('Invariant violated: missing task');
    if(agent.activity){
      const target=state.sceneObjects?.[agent.activity.targetId];
      if(!target||target.reservedBy!==agent.id||agent.currentAction?.type!=='use_skill'||agent.currentAction.intentId!==agent.activity.intentId)throw new Error('Invariant violated: skill reservation/action');
      if(agent.activity.stage==='acting'&&(!agent.position||Math.hypot(agent.position.x-target.approach.x,agent.position.y-target.approach.y)>.01))throw new Error('Invariant violated: skill not at target');
    }
  }
  for(const object of Object.values(state.sceneObjects??{}))if(object.reservedBy&&state.agents[object.reservedBy]?.activity?.targetId!==object.id)throw new Error('Invariant violated: orphan object reservation');
}
