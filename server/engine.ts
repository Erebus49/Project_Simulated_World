import { randomInt, randomUUID } from 'node:crypto';
import { actorIds, type Action, type Actor, type ActorId, type Attributes, type Check, type Decision, type GameEvent, type LocationId, type Viewer, type World, type WorldView } from '../shared/types';
import { clues, createActors, opening, placeById, scenarioClues, scenarioPlaces } from '../shared/scenario';
import { createKillerWorld, killerActionOptions, killerObjective, resolveKillerRound, validateKillerAction } from './killer';
import { isKiller } from '../shared/killer';

export type Dice = () => number;
export const rollD20: Dice = () => randomInt(1, 21);
export function createWorld(title = '第七声钟鸣'): World {
  const now = new Date().toISOString();
  const actors = createActors();
  for (const actor of actors) {
    for (const id of actor.knownClues) {
      const clue = clues.find(c => c.id === id)!;
      actor.memories.push({ id: randomUUID(), round: 0, locationId: actor.locationId, text: `你一直知道「${clue.title}」：${clue.text}` });
    }
  }
  return { version: 1, id: randomUUID(), title, createdAt: now, updatedAt: now, revision: 0, round: 0, maxRounds: 12, status: 'active', danger: 0, ending: null, actors, history: [{ number: 0, narration: opening, decisions: {}, events: [] }] };
}
export function actorById(world: World, id: ActorId): Actor {
  const actor = world.actors.find(a => a.id === id);
  if (!actor) throw new Error('角色不存在');
  return actor;
}
export function validateAction(world: World, actor: Actor, action: Action): string | null {
  if (isKiller(world)) return validateKillerAction(world, actor, action);
  if (world.status !== 'active') return '这一段故事已经结束，请开启新的冒险。';
  if ((actor.sanity <= 0 || actor.hp <= 0) && action.kind !== 'rest') return '你已精疲力竭，需要先休整。';
  if (action.kind === 'move') {
    if (!placeById[actor.locationId].neighbors.includes(action.target as LocationId)) return '只能移动到地图上相邻的地点。';
  }
  if (['talk', 'share', 'calm'].includes(action.kind)) {
    const target = world.actors.find(a => a.id === action.target);
    if (!target || target.id === actor.id || target.locationId !== actor.locationId) return '目标角色不在你所在的场景。';
  }
  if (action.kind === 'share' && (!action.clueId || !actor.knownClues.includes(action.clueId))) return '只能分享你已经掌握的线索。';
  if (action.kind === 'investigate' && !clues.some(c => c.locationId === actor.locationId && !actor.knownClues.includes(c.id))) return '这里已没有你尚未掌握的线索，可以与其他人交换消息。';
  if (action.kind === 'seal') {
    if (actor.locationId !== 'lighthouse') return '只有在灰烬灯塔才能尝试封印。';
    if (actor.knownClues.length < 3) return '你需要亲自掌握至少三条线索，才能理解封印的方法。';
  }
  return null;
}

export interface Observation {
  scenarioId?: World['scenarioId']; playerActorId?: ActorId; availableActions?: WorldView['availableActions']; time?: string;
  round: number; remainingRounds: number; danger: number;
  self: Pick<Actor, 'id' | 'name' | 'role' | 'personality' | 'backstory' | 'publicGoal' | 'privateGoal' | 'secret' | 'behavior' | 'attributes' | 'hp' | 'sanity' | 'locationId' | 'visited' | 'relationships' | 'skills' | 'inventory'>;
  place: typeof placeById[LocationId];
  nearby: Pick<Actor, 'id' | 'name' | 'role' | 'publicGoal' | 'hp' | 'sanity'>[];
  knownClues: typeof clues; memories: Actor['memories']; investigationAvailable: boolean;
  map: { id: LocationId; name: string; neighbors: LocationId[] }[];
}
export function observe(world: World, id: ActorId): Observation {
  const actor = actorById(world, id);
  const { knownClues, memories, maxHp: _hp, maxSanity: _san, color: _color, subtitle: _sub, ...self } = actor;
  return structuredClone({
    scenarioId: world.scenarioId, playerActorId: world.playerActorId, ...(isKiller(world) ? { availableActions: killerActionOptions(world, actor), time: (world.round * 2 + 3) + '小时（自第一天零点起）' } : {}),
    round: world.round, remainingRounds: world.maxRounds - world.round, danger: world.danger, self,
    place: placeById[actor.locationId],
    nearby: world.actors.filter(a => a.id !== id && a.locationId === actor.locationId).map(({ id, name, role, publicGoal, hp, sanity }) => ({ id, name, role, publicGoal, hp, sanity })),
    knownClues: scenarioClues(world).filter(c => knownClues.includes(c.id)), memories: memories.slice(-18),
    investigationAvailable: isKiller(world) ? killerActionOptions(world, actor).some(a => a.action.kind === 'investigate') : clues.some(c => c.locationId === actor.locationId && !knownClues.includes(c.id)),
    map: scenarioPlaces(world).map(({ id, name, neighbors }) => ({ id, name, neighbors })),
  });
}

export function resolveRound(previous: World, decisions: Record<ActorId, Decision>, dice: Dice = rollD20): World {
  if (isKiller(previous)) return resolveKillerRound(previous, decisions, dice === rollD20 ? () => randomInt(1, 101) : dice);
  if (previous.status !== 'active') throw new Error('故事已经结束');
  const world = structuredClone(previous);
  world.round += 1;
  const events: GameEvent[] = [];
  function emit(actor: Actor | undefined, kind: GameEvent['kind'], text: string, visibleTo: ActorId[], isPrivate = false, check?: Check) {
    const event: GameEvent = { id: randomUUID(), round: world.round, actorId: actor?.id, kind, text, locationId: actor?.locationId ?? 'square', visibleTo, private: isPrivate, check };
    events.push(event);
    for (const id of visibleTo) {
      const receiver = actorById(world, id);
      receiver.memories.push({ id: event.id, round: world.round, text, locationId: event.locationId });
      receiver.memories = receiver.memories.slice(-80);
    }
  }
  function check(actor: Actor, skill: keyof Attributes, dc: number): Check {
    const die = dice();
    if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error('骰点必须在 1–20 之间');
    const modifier = actor.attributes[skill];
    return { die, modifier, total: die + modifier, dc, success: die + modifier >= dc, skill };
  }
  const order = [...world.actors].sort((a, b) => b.attributes.agility - a.attributes.agility || actorIds.indexOf(a.id) - actorIds.indexOf(b.id));
  for (const actor of order) {
    if (world.status !== 'active') break;
    const decision = decisions[actor.id];
    if (!decision) throw new Error(`缺少${actor.name}的行动`);
    const action = decision.action;
    const witnesses = world.actors.filter(a => a.locationId === actor.locationId).map(a => a.id);
    const invalid = validateAction(world, actor, action);
    if (invalid) { emit(actor, 'interrupted', `${actor.name}的行动未能发生：${invalid}`, [actor.id], true); continue; }
    const target = world.actors.find(a => a.id === action.target);
    const words = action.speech.trim() ? `“${action.speech.trim()}”` : '';
    switch (action.kind) {
      case 'move': {
        const from = actor.locationId;
        actor.locationId = action.target as LocationId;
        if (!actor.visited.includes(actor.locationId)) actor.visited.push(actor.locationId);
        const arrivals = world.actors.filter(a => a.locationId === actor.locationId).map(a => a.id);
        emit(actor, 'move', `${actor.name}离开${placeById[from].name}，抵达${placeById[actor.locationId].name}。${words}`, [...new Set([...witnesses, ...arrivals])]);
        break;
      }
      case 'investigate': {
        const clue = clues.find(c => c.locationId === actor.locationId && !actor.knownClues.includes(c.id))!;
        const result = check(actor, 'investigation', clue.dc);
        emit(actor, 'investigate', `${actor.name}仔细搜查${placeById[actor.locationId].name}，${result.success ? '找到了一处值得留意的细节' : '暂时没有找到答案，雾中的低语让心神受损（理智 −1）'}。${words}`, witnesses, false, result);
        if (result.success) {
          actor.knownClues.push(clue.id);
          emit(actor, 'investigate', `${actor.name}发现「${clue.title}」：${clue.text}`, [actor.id], true);
        } else actor.sanity = Math.max(0, actor.sanity - 1);
        break;
      }
      case 'share': {
        const clue = clues.find(c => c.id === action.clueId)!;
        if (!target!.knownClues.includes(clue.id)) target!.knownClues.push(clue.id);
        actor.relationships[target!.id] = Math.min(5, actor.relationships[target!.id] + 1);
        target!.relationships[actor.id] = Math.min(5, target!.relationships[actor.id] + 1);
        emit(actor, 'share', `${actor.name}将「${clue.title}」告诉了${target!.name}：${clue.text}${words}`, [actor.id, target!.id], true);
        break;
      }
      case 'talk': {
        const result = check(actor, 'persuasion', Math.max(7, 11 - actor.relationships[target!.id]));
        if (result.success) {
          actor.relationships[target!.id] = Math.min(5, actor.relationships[target!.id] + 1);
          target!.relationships[actor.id] = Math.min(5, target!.relationships[actor.id] + 1);
        }
        emit(actor, 'talk', `${actor.name}对${target!.name}说：${words || '“我们需要彼此的帮助。”'} ${result.success ? '两人之间的戒心稍稍松动（信任 +1）。' : '对方仍然保持着距离。'}`, witnesses, false, result);
        break;
      }
      case 'calm': {
        const result = check(actor, 'resolve', 10);
        const restored = Math.min(target!.maxSanity - target!.sanity, result.success ? 4 : 1);
        target!.sanity += restored;
        emit(actor, 'calm', `${actor.name}陪在${target!.name}身边，让对方稳住呼吸（理智 +${restored}）。${words}`, witnesses, false, result);
        break;
      }
      case 'rest': {
        const restored = Math.min(actor.maxSanity - actor.sanity, actor.locationId === 'tavern' ? 4 : 2);
        actor.sanity += restored;
        actor.hp = Math.min(actor.maxHp, actor.hp + 1);
        emit(actor, 'rest', `${actor.name}在${placeById[actor.locationId].name}稍作休整，重新整理思绪（理智 +${restored}）。${words}`, witnesses);
        break;
      }
      case 'seal': {
        const result = check(actor, 'resolve', 12);
        if (result.success) {
          world.status = 'saved';
          world.ending = `${actor.name}敲响三次小铜钟，逆转镜片。幽蓝的光在黎明前熄灭，海水终于退去。雾港得以幸存，但每个人都将带着今晚的秘密，走向各自的明天。`;
          emit(actor, 'seal', `${actor.name}完成了封印。${words} 海雾开始退去。`, [...actorIds], false, result);
        } else {
          actor.sanity = Math.max(0, actor.sanity - 3);
          world.danger = Math.min(12, world.danger + 1);
          emit(actor, 'seal', `${actor.name}尝试逆转镜片，却被强烈的共鸣震退（理智 −3，危机 +1）。封印尚未完成。`, witnesses, false, result);
        }
        break;
      }
    }
  }
  if (world.status === 'active') {
    world.danger = Math.min(12, world.danger + 1);
    if (world.round >= world.maxRounds || world.danger >= 12) {
      world.status = 'lost';
      world.ending = '真正的第七声钟鸣响起。镜片仍在转动，海雾越过堤岸，吞没了回家的路。也许下一次，有人会更早说出自己的秘密。';
      emit(undefined, 'world', world.ending, [...actorIds]);
    } else {
      emit(undefined, 'world', world.danger >= 8 ? '潮水漫过最下面的石阶，留给雾港的时间已经不多。' : '钟针又向前挪了一格，海雾正在慢慢变浓。', [...actorIds]);
    }
  }
  world.history.push({ number: world.round, narration: '', decisions: structuredClone(decisions), events });
  world.revision += 1;
  world.updatedAt = new Date().toISOString();
  return world;
}

export function projectWorld(world: World, viewer: Viewer): WorldView {
  if (viewer !== 'director' && !world.actors.some(a => a.id === viewer)) viewer = world.playerActorId ?? 'director';
  const own = viewer === 'director' ? null : actorById(world, viewer);
  const visibleClues = scenarioClues(world);
  const known = viewer === 'director' ? visibleClues.map(c => c.id) : own!.knownClues;
  return {
    ...structuredClone(world), viewer,
    actors: world.actors.map(actor => {
      const { privateGoal, secret, memories, knownClues, relationships, ...publicActor } = structuredClone(actor);
      const canRead = viewer === 'director' || viewer === actor.id;
      return { ...publicActor,
        backstory: canRead ? publicActor.backstory : '', visited: canRead ? publicActor.visited : [],
        locationId: viewer === 'director' || actor.id === viewer || actor.locationId === own!.locationId ? actor.locationId : null,
        ...(canRead ? { privateGoal, secret, relationships } : {}),
        memories: canRead ? memories : [], knownClues: canRead ? knownClues : [],
      };
    }),
    clues: visibleClues.filter(c => known.includes(c.id)).map(c => structuredClone(c)),
    ...(isKiller(world) ? { availableActions: own ? killerActionOptions(world, own) : [], currentObjective: own ? killerObjective(world, own) : '守秘人视角：能够读取模组全部信息。' } : {}),
    history: world.history.map(round => {
      const events = round.events.filter(e => viewer === 'director' || e.visibleTo.includes(viewer)).map(e => structuredClone(e));
      const decisions = viewer === 'director' ? structuredClone(round.decisions) : round.decisions[viewer] ? { [viewer]: structuredClone(round.decisions[viewer]) } : {};
      return { number: round.number, events, decisions,
        ...(round.narrations && viewer !== 'director' && round.narrations[viewer] ? { narrations: { [viewer]: round.narrations[viewer] } } : {}),
        narration: viewer === 'director' || round.number === 0 ? round.narration : round.narrations?.[viewer] ?? events.filter(e => !e.private || e.visibleTo.includes(viewer)).map(e => e.text).join('\n\n'),
      };
    }),
  };
}

export function demoNarration(world: World): string {
  const round = world.history.at(-1)!;
  if (world.ending) return world.ending;
  if (isKiller(world)) return round.events.filter(e => e.visibleTo.includes(world.playerActorId!) && !['rest', 'talk'].includes(e.kind)).map(e => e.text).join('\n\n') || '镇上暂时没有新的动静。你可以继续与人交谈，检查现场，或返回小屋思考下一步。';
  const atmosphere = ['雾像一封没有落款的信，慢慢展开。', '灯火在风里摇晃，每个人都在做自己的选择。', '海潮不会等待迟疑的人。今晚的故事，又向前走了一步。'][world.round % 3];
  const highlights = round.events.filter(e => e.kind !== 'world' && !e.private).slice(0, 4).map(e => e.text.replace(/（[^）]*）/g, '')).join('\n\n');
  return `${atmosphere}\n\n${highlights}\n\n${world.danger >= 7 ? '远处的蓝光越发刺眼。那些尚未说出口的秘密，也许正是最后的机会。' : '线索还散落在港口各处，而他们尚不知道，谁会成为今晚最值得信任的人。'}`;
}
export { createKillerWorld };
