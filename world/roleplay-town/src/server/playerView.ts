import type { WorldRuntime } from '../engine/runtime.js';
import type { PlayView } from '../shared/play.js';
import { TOWN_SETTING } from '../scenarios/roleplayTown.js';

/** Player projection. No NPC profiles, goals, money, inventory, inboxes or state diffs. */
export function playerView(engine: WorldRuntime, context: Pick<PlayView, 'mode' | 'started' | 'busy' | 'configured' | 'model' | 'error' | 'notice'>): PlayView {
  const state = engine.snapshot();
  const player = Object.values(state.agents).find(agent => agent.control === 'human');
  if (!player) throw new Error('当前为调试场景，请先创建角色扮演新局。');
  const observation = engine.observe(player.id);
  // Adjacent outdoor areas can be seen on screen. This only publishes presence,
  // never personal goals, resources, messages, or the model's proposed actions.
  const outdoor = new Set([player.locationId, ...(state.locations[player.locationId]?.neighborIds ?? [])]);
  const allEvents = engine.events();
  const seen = new Set(player.seenEventIds);
  const visibleTypes = new Set(['message_sent', 'message_received', 'purchase_completed', 'price_changed', 'task_completed', 'action_rejected','skill_started','skill_completed']);
  return {
    ...context, runId: state.runId, tick: state.tick, setting: structuredClone(state.config.setting ?? TOWN_SETTING),
    player: structuredClone(observation.self), locations: structuredClone(observation.locations), shops: structuredClone(observation.shops),
    objects:JSON.parse(JSON.stringify(Object.values(state.sceneObjects??{}).filter(object=>outdoor.has(object.locationId)))) as NonNullable<PlayView['objects']>,
    roster: Object.values(state.agents).filter(agent => agent.control !== 'human').map(agent => {
      const lastMove = [...allEvents].reverse().find(event => event.actorId === agent.id && event.type === 'task_scheduled' && event.payload.type === 'move');
      const from = String(lastMove?.payload.fromLocationId ?? agent.locationId), to = String(lastMove?.payload.destinationId ?? agent.locationId);
      const moving = !!lastMove && agent.currentAction?.intentId === lastMove.payload.intentId;
      const visible = outdoor.has(agent.locationId) || moving && (outdoor.has(from) || outdoor.has(to));
      return {
      id: agent.id, name: agent.name, bio: agent.publicBio ?? agent.name,
      nearby: agent.locationId === player.locationId, mode: agent.locationId === player.locationId ? agent.mode : null,
      appearance: visible ? { locationId: agent.locationId,...(agent.position?{position:structuredClone(agent.position)}:{}),activity:agent.activity?structuredClone(agent.activity):null,movement: lastMove ? {
        id: String(lastMove.payload.intentId), from, to, phase: moving ? 'walking' as const : 'arrived' as const,
      } : null } : null,
    }; }),
    events: engine.events().filter(event => visibleTypes.has(event.type) && seen.has(event.eventId) &&
      (event.visibility.type === 'public' || event.visibility.recipientIds.includes(player.id)))
      .map(({ differences: _diff, visibility: _visibility, worldVersion: _version, ...event }) => JSON.parse(JSON.stringify(event)) as PlayView['events'][number]),
  };
}
