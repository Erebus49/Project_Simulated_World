import type { ActionIntent, ActionPhase, ActionType, AllowedAction, DeepReadonly, WorldEvent, WorldState } from '../shared/types.js';
import { isReachable } from '../agents/observation.js';
import type { EventInput } from './events.js';

interface Effect { event: EventInput; apply: (state: WorldState, eventId: string) => void }
interface ActionDefinition {
  phase: ActionPhase;
  description: string;
  validate: (world: DeepReadonly<WorldState>, intent: ActionIntent) => string | null;
  effect: (world: DeepReadonly<WorldState>, intent: ActionIntent) => Effect;
}
const actor = (world: DeepReadonly<WorldState>, intent: ActionIntent) => world.agents[intent.agentId]!;
const privateEvent = (intent: ActionIntent, type: WorldEvent['type'], payload: NonNullable<EventInput['payload']>): EventInput =>
  ({ type, actorId: intent.agentId, batchId: intent.batchId, visibility: { type: 'recipients', recipientIds: [intent.agentId] }, payload, sourceEventIds: intent.sourceEventIds });
export const PHASE_ORDER: readonly ActionPhase[] = ['message', 'resource', 'task'];

export const ACTION_REGISTRY: Record<ActionType, ActionDefinition> = {
  use_skill:{
    phase:'task',description:'Choose one of your own skills and a concrete visible object. Walk to its approach point, then execute it. Object is reserved until completion. Only completed actions change the object.',
    validate(world,intent){
      if(intent.type!=='use_skill')return 'wrong_action_shape';
      const agent=actor(world,intent),skill=world.config.skillDefinitions?.find(definition=>definition.id===intent.params.skillId),target=world.sceneObjects?.[intent.params.targetId];
      if(!skill||!agent.character?.skillIds.includes(skill.id))return 'skill_not_owned';
      if(!target)return 'target_not_found';
      if(target.locationId!==agent.locationId)return 'target_not_here';
      if(!skill.targetTags.some(tag=>target.tags.includes(tag)))return 'skill_target_mismatch';
      if(target.reservedBy)return 'target_reserved';
      const last=agent.skillHistory?.[`${skill.id}:${target.id}`];
      if(last!==undefined&&world.tick-last<skill.cooldownTicks)return 'skill_cooldown';
      if(skill.effect.stat&&skill.effect.maximum!==undefined&&(target.state[skill.effect.stat]??0)>=skill.effect.maximum)return 'target_already_done';
      return null;
    },
    effect(world,intent){
      if(intent.type!=='use_skill')throw new Error('wrong_action_shape');
      const agent=actor(world,intent),skill=world.config.skillDefinitions!.find(definition=>definition.id===intent.params.skillId)!,target=world.sceneObjects![intent.params.targetId]!;
      const from=agent.position??target.approach;
      const travelTicks=Math.max(1,Math.ceil((Math.hypot(from.x-target.approach.x,from.y-target.approach.y)*1.6+8)/31));
      const actAtTick=world.tick+travelTicks,dueTick=actAtTick+skill.durationTicks;
      return {event:{type:'task_scheduled',actorId:agent.id,batchId:intent.batchId,visibility:{type:'recipients',recipientIds:world.agentOrder.filter(id=>world.agents[id]!.locationId===agent.locationId)},
        payload:{type:'use_skill',skillId:skill.id,targetId:target.id,targetName:target.name,title:skill.name,intentId:intent.intentId,actAtTick,dueTick,speech:intent.params.speech??''}},
        apply(state){
          const current=state.agents[agent.id]!;state.sceneObjects![target.id]!.reservedBy=agent.id;
          current.activity={intentId:intent.intentId,skillId:skill.id,targetId:target.id,title:skill.name,animation:skill.animation,stage:'approaching',from:{...from},to:{...target.approach},startedTick:state.tick,actAtTick,dueTick,speech:intent.params.speech??''};
          current.currentAction={intentId:intent.intentId,type:'use_skill',startedTick:state.tick,dueTick};current.mode='executing';
          state.scheduledTasks.push({taskId:`${intent.intentId}:task`,actorId:agent.id,intentId:intent.intentId,type:'use_skill',dueTick,destinationId:null,income:0,skillId:skill.id,targetId:target.id});
        }};
    },
  },
  send_message: {
    phase: 'message', description: 'Send one short message to a co-located agent or your direct contact; cite only messages you have received.',
    validate(world, intent) {
      if (intent.type !== 'send_message') return 'wrong action shape';
      if (!isReachable(world, intent.agentId, intent.params.targetId)) return 'recipient_unreachable';
      const agent = actor(world, intent);
      const limit = Object.values(world.rules).find(rule => rule.type === 'speech_limit' && rule.enabled && rule.effectiveTick <= world.tick);
      return limit && agent.speechCount >= limit.dailyLimit ? 'speech_limit_exceeded' : null;
    },
    effect(world, intent) {
      if (intent.type !== 'send_message') throw new Error('wrong action shape');
      const { targetId, content } = intent.params;
      return {
        event: privateEvent(intent, 'message_sent', { targetId, content, kind: intent.sourceEventIds.length ? 'retelling' : 'statement', deliverAtTick: world.tick + 1 }),
        apply(state, eventId) {
          state.agents[intent.agentId]!.speechCount++;
          state.metrics.messagesSent++;
          state.pendingEvents.push({ deliveryId: `${intent.intentId}:delivery`, dueTick: state.tick + 1,
            senderId: intent.agentId, recipientId: targetId, sentEventId: eventId, content,
            kind: intent.sourceEventIds.length ? 'retelling' : 'statement' });
        },
      };
    },
  },
  buy: {
    phase: 'resource', description: 'Buy 1–8 coffees at a co-located shop. Specify the maximum unit price you accept.',
    validate(world, intent) {
      if (intent.type !== 'buy') return 'wrong action shape';
      const shop = world.shops[intent.params.shopId], buyer = actor(world, intent);
      if (!shop) return 'shop_not_found';
      if (shop.ownerId === buyer.id) return 'owner_cannot_buy_from_self';
      if (shop.locationId !== buyer.locationId) return 'shop_not_here';
      if (shop.unitPrice > intent.params.maxUnitPrice) return 'price_exceeds_limit';
      if (shop.stock < intent.params.quantity) return 'insufficient_stock';
      if (buyer.money < shop.unitPrice * intent.params.quantity) return 'insufficient_money';
      return null;
    },
    effect(world, intent) {
      if (intent.type !== 'buy') throw new Error('wrong action shape');
      const shop = world.shops[intent.params.shopId]!, { quantity } = intent.params, unitPrice = shop.unitPrice;
      return {
        event: { type: 'purchase_completed', batchId: intent.batchId, actorId: intent.agentId,
          visibility: { type: 'public' }, payload: { shopId: shop.id, quantity, unitPrice, total: unitPrice * quantity } },
        apply(state) {
          const current = state.shops[shop.id]!, buyer = state.agents[intent.agentId]!, seller = state.agents[current.ownerId]!;
          buyer.money -= unitPrice * quantity; seller.money += unitPrice * quantity; current.stock -= quantity;
          buyer.inventory.coffee = (buyer.inventory.coffee ?? 0) + quantity;
          state.metrics.transactions++;
        },
      };
    },
  },
  set_price: {
    phase: 'resource', description: 'Only the shop owner may change its public posted price within the configured range.',
    validate(world, intent) {
      if (intent.type !== 'set_price') return 'wrong action shape';
      const shop = world.shops[intent.params.shopId];
      if (!shop) return 'shop_not_found';
      if (shop.ownerId !== intent.agentId) return 'not_shop_owner';
      return intent.params.unitPrice < world.config.minUnitPrice || intent.params.unitPrice > world.config.maxUnitPrice ? 'price_out_of_range' : null;
    },
    effect(_world, intent) {
      if (intent.type !== 'set_price') throw new Error('wrong action shape');
      return { event: { type: 'price_changed', batchId: intent.batchId, actorId: intent.agentId,
        payload: { shopId: intent.params.shopId, unitPrice: intent.params.unitPrice } },
        apply(state) { state.shops[intent.params.shopId]!.unitPrice = intent.params.unitPrice; } };
    },
  },
  move: {
    phase: 'task', description: 'Move along a map edge; location changes only when the scheduled movement completes.',
    validate(world, intent) {
      if (intent.type !== 'move') return 'wrong action shape';
      if (!world.locations[intent.params.destinationId]) return 'destination_not_found';
      return world.locations[actor(world, intent).locationId]?.neighborIds.includes(intent.params.destinationId) ? null : 'destination_not_adjacent';
    },
    effect(world, intent) {
      if (intent.type !== 'move') throw new Error('wrong action shape');
      return taskEffect(world, intent, world.config.movementDurationTicks, intent.params.destinationId, 0);
    },
  },
  work: {
    phase: 'task', description: 'Work at one of your allowed workplaces for a bounded number of ticks. Earn a fixed wage on completion.',
    validate(world, intent) {
      if (intent.type !== 'work') return 'wrong action shape';
      const agent = actor(world, intent);
      if(agent.character)return 'choose_concrete_skill';
      if (!agent.workLocationIds.includes(agent.locationId)) return 'workplace_not_allowed';
      return intent.params.durationTicks > world.config.maxDurationTicks ? 'duration_exceeds_limit' : null;
    },
    effect(world, intent) {
      if (intent.type !== 'work') throw new Error('wrong action shape');
      return taskEffect(world, intent, intent.params.durationTicks, null, intent.params.durationTicks * world.config.wagePerTick);
    },
  },
  wait: {
    phase: 'task', description: 'Wait for a bounded number of ticks without requesting a new decision each tick.',
    validate(world, intent) {
      return intent.type === 'wait' && intent.params.durationTicks <= world.config.maxDurationTicks ? null : 'duration_exceeds_limit';
    },
    effect(world, intent) {
      if (intent.type !== 'wait') throw new Error('wrong action shape');
      return taskEffect(world, intent, intent.params.durationTicks, null, 0);
    },
  },
};

function taskEffect(world: DeepReadonly<WorldState>, intent: ActionIntent, duration: number, destinationId: string | null, income: number): Effect {
  if (!['move', 'work', 'wait'].includes(intent.type)) throw new Error('task action expected');
  const type = intent.type as 'move' | 'work' | 'wait', dueTick = world.tick + duration;
  return {
    event: privateEvent(intent, 'task_scheduled', { type, durationTicks: duration, dueTick, destinationId, fromLocationId: world.agents[intent.agentId]!.locationId }),
    apply(state) {
      state.scheduledTasks.push({ taskId: `${intent.intentId}:task`, actorId: intent.agentId, intentId: intent.intentId,
        type, dueTick, destinationId, income });
      state.scheduledTasks.sort((a, b) => a.dueTick - b.dueTick || a.taskId.localeCompare(b.taskId));
      state.agents[intent.agentId]!.currentAction = { intentId: intent.intentId, type, startedTick: state.tick, dueTick };
      state.agents[intent.agentId]!.mode = type === 'wait' ? 'waiting' : 'executing';
    },
  };
}

export function allowedActions(world: DeepReadonly<WorldState>, agentId: string): readonly AllowedAction[] {
  return Object.entries(ACTION_REGISTRY).filter(([type]) => (type!=='use_skill'||!!world.agents[agentId]?.character)&&(type!=='work'||!world.agents[agentId]?.character)&&(type !== 'set_price' || Object.values(world.shops).some(shop => shop.ownerId === agentId)))
    .map(([type, definition]) => ({ type: type as ActionType, phase: definition.phase, description: definition.description }));
}

export function validateIntent(world: DeepReadonly<WorldState>, intent: ActionIntent, events: DeepReadonly<WorldEvent[]>): string | null {
  const agent = world.agents[intent.agentId];
  if (!agent) return 'agent_not_found';
  if (intent.runId !== world.runId) return 'stale_run';
  if (agent.currentAction) return 'agent_busy';
  const seen = new Set(agent.seenEventIds), referenced = new Set(intent.sourceEventIds);
  if (referenced.size !== intent.sourceEventIds.length) return 'duplicate_source';
  for (const id of referenced) {
    const source = events.find(event => event.eventId === id);
    if (!source || !seen.has(id)) return 'source_not_seen';
    if (source.visibility.type !== 'public' && !source.visibility.recipientIds.includes(intent.agentId)) return 'source_not_visible';
    if (intent.type === 'send_message' && !['rumor_injected', 'message_received', 'message_sent'].includes(source.type)) return 'source_not_message';
  }
  return ACTION_REGISTRY[intent.type].validate(world, intent);
}
