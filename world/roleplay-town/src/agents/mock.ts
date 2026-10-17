import type { AgentObservation, AllowedAction, DecisionProvider, DecisionResult, DeepReadonly } from '../shared/types.js';

export type MockStrategy = (observation: DeepReadonly<AgentObservation>) => unknown | Promise<unknown>;

/** Explicit deterministic heuristics. No model, credentials, network or hidden world access. */
export class MockDecisionProvider implements DecisionProvider {
  readonly name = 'deterministic-mock';
  constructor(private readonly strategy?: MockStrategy) {}
  decide(observation: DeepReadonly<AgentObservation>, _allowed: readonly AllowedAction[], signal: AbortSignal): unknown | Promise<unknown> {
    signal.throwIfAborted();
    return this.strategy ? this.strategy(observation) : mockDecision(observation);
  }
}

function mockDecision(observation: DeepReadonly<AgentObservation>): DecisionResult {
  const self = observation.self;
  if(observation.character){
    for(const skill of observation.skills??[])for(const object of observation.objects??[]){
      if(skill.id==='rest'||object.reservedBy||!skill.targetTags.some(tag=>object.tags.includes(tag)))continue;
      if(skill.effect.stat&&skill.effect.maximum!==undefined&&(object.state[skill.effect.stat]??0)>=skill.effect.maximum)continue;
      const last=observation.skillHistory?.[`${skill.id}:${object.id}`];if(last!==undefined&&observation.tick-last<skill.cooldownTicks)continue;
      return {type:'use_skill',params:{skillId:skill.id,targetId:object.id},intentSummary:'Mock：选择一个可执行且未完成的技能目标'};
    }
    return {type:'wait',params:{durationTicks:3}};
  }
  if (self.profile.shareRumors) {
    // Forward each received claim at most once, deterministically selecting a contact.
    const source = observation.inbox.find(message => !observation.recentMemory.some(event => event.type === 'message_sent' && event.sourceEventIds.includes(message.eventId)));
    const target = observation.reachableAgentIds.find(id => id !== source?.senderId);
    const limit = observation.rules.find(rule => rule.enabled);
    if (source && target && (!limit || self.speechCount < limit.dailyLimit)) {
      return { type: 'send_message', params: { targetId: target, content: `我收到一个尚未核实的说法：${source.content}`.slice(0, 240) }, sourceEventIds: [source.eventId] };
    }
  }
  const shop = observation.shops[0];
  if (self.profile.role === 'customer' && shop && !self.inventory.coffee) {
    if (self.locationId !== shop.locationId) {
      const neighbors = observation.locations.find(location => location.id === self.locationId)?.neighborIds ?? [];
      const destinationId = neighbors.includes(shop.locationId) ? shop.locationId : neighbors[0];
      if (destinationId) return { type: 'move', params: { destinationId } };
    } else if (shop.stock && self.money >= shop.unitPrice) {
      return { type: 'buy', params: { shopId: shop.id, quantity: 1, maxUnitPrice: shop.unitPrice } };
    }
  }
  if (['barista', 'supplier'].includes(self.profile.role) && self.workLocationIds.includes(self.locationId)) {
    return { type: 'work', params: { durationTicks: Math.min(3, observation.limits.maxDurationTicks) } };
  }
  // The mock owner does not turn a rumor into a price change by scripted fiat.
  return { type: 'wait', params: { durationTicks: Math.min(3, observation.limits.maxDurationTicks) } };
}
