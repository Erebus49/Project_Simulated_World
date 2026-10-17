import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Action, ActorId, Decision, Settings, World } from '../shared/types.js';
import { actorStartPoint, distance, EXIT_POINTS, INTERACTION_RANGE, SCENE_SIZE, type Point } from '../shared/scene.js';
import { createKillerWorld, killerActionOptions } from './killer.js';
import { createProvider, demoDecision } from './agents.js';
import { demoNarration, projectWorld, resolveRound, validateAction } from './engine.js';
import { Store } from './store.js';

const store = new Store(process.env.KILLER_DB_PATH || resolve('data', 'investigations.sqlite'));
const memoryWorlds = new Map<string, World>();
const walkClock = new Map<string, number>();
let activeWorldId: string | null = null;
let turnInProgress = false;

function readWorld(id: string): World | null {
  let world = memoryWorlds.get(id) ?? store.get(id);
  if (!world) return null;
  if (world.elapsedMinutes === undefined) world.elapsedMinutes = 180;
  for (const actor of world.actors) actor.position ??= actorStartPoint(actor.id, actor.locationId);
  memoryWorlds.set(id, world);
  return world;
}

function activeWorld(): World | null {
  if (activeWorldId) return readWorld(activeWorldId);
  const latest = store.list()[0];
  activeWorldId = latest?.id ?? null;
  return activeWorldId ? readWorld(activeWorldId) : null;
}

export function storyState(id?: string) {
  const world = id ? readWorld(id) : activeWorld();
  if (world) activeWorldId = world.id;
  return { world: world ? projectWorld(world, world.playerActorId ?? 'director') : null,
    worlds: store.list().slice(0, 20), settings: store.settingsView(), busy: turnInProgress };
}

export function storySettings() { return store.settingsView(); }
export function saveStorySettings(input: Partial<Settings>) {
  const previous = store.settings();
  const next: Settings = { ...previous, ...input, apiKey: input.apiKey?.trim() || previous.apiKey };
  const base = new URL(next.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || !next.model.trim()) {
    throw new Error('请填写有效的 HTTP(S) API 基础地址和模型名称。');
  }
  store.saveSettings(next);
  return store.settingsView();
}

export function createStory(input: { actorId?: string; name?: string; mode?: string }) {
  if (turnInProgress) throw new Error('请等当前行动结算后再开始新故事。');
  const actorId = input.actorId as ActorId | undefined;
  const name = input.name?.trim().slice(0, 24) || '调查员';
  const settings = store.settings();
  const mode = input.mode === 'llm' ? 'llm' : 'demo';
  if (!['avery', 'morgan', 'reed'].includes(actorId ?? '')) throw new Error('请选择一名调查员。');
  if (mode === 'llm' && (!settings.apiKey || !settings.model || !settings.baseUrl)) throw new Error('请先配置模型，或选择本地演示。');
  const world = createKillerWorld(`来自群星的杀手 · ${name}`, actorId!, true);
  world.actors.find(actor => actor.id === actorId)!.name = name;
  world.agentMode = mode;
  store.save(world);
  memoryWorlds.set(world.id, world);
  activeWorldId = world.id;
  walkClock.set(world.id, Date.now());
  return storyState(world.id);
}

function canWalk(world: World, point: Point, now: number) {
  const actor = world.actors.find(item => item.id === world.playerActorId)!;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 24 || point.y < 24 || point.x > SCENE_SIZE.width - 24 || point.y > SCENE_SIZE.height - 24) return false;
  const last = walkClock.get(world.id) ?? now;
  const elapsed = Math.max(0, now - last);
  const maxDistance = Math.min(180, 16 + elapsed * 0.34);
  if (distance(actor.position ?? actorStartPoint(actor.id, actor.locationId), point) > maxDistance) return false;
  walkClock.set(world.id, now);
  return true;
}

export function walkInScene(id: string, point: Point) {
  if (turnInProgress) throw new Error('大家正在行动，等本轮结束后再走动。');
  const world = readWorld(id);
  if (!world || world.status !== 'active') throw new Error('当前没有进行中的调查。');
  const actor = world.actors.find(item => item.id === world.playerActorId)!;
  if (!canWalk(world, point, Date.now())) throw new Error('移动太快或位置超出场景范围，请按住方向键慢慢走。');
  actor.position = { x: Math.round(point.x), y: Math.round(point.y) };
  return storyState(world.id);
}

export async function playAction(id: string, action: Action) {
  if (turnInProgress) throw new Error('AI 角色正在行动，请稍候。');
  const previous = readWorld(id);
  if (!previous || previous.status !== 'active') throw new Error('当前故事已经结束或不存在。');
  const player = previous.actors.find(actor => actor.id === previous.playerActorId)!;
  if (action.kind === 'move') {
    const exit = EXIT_POINTS[player.locationId]?.[action.target as typeof player.locationId];
    if (!exit || !player.position || distance(player.position, exit) > INTERACTION_RANGE) throw new Error('请先在地图上走到对应出口。');
  }
  const invalid = validateAction(previous, player, action);
  if (invalid) throw new Error(invalid);

  turnInProgress = true;
  try {
    const settings = { ...store.settings(), mode: previous.agentMode ?? 'demo' };
    const provider = createProvider(settings);
    const decisions = {} as Record<ActorId, Decision>;
    decisions[player.id] = { intent: '玩家亲自选择了这个行动。', action };
    const controlled = previous.actors.filter(actor => actor.id !== player.id && actor.hp > 0);
    const responseTarget = action.kind === 'talk' ? action.target : undefined;
    const question = responseTarget ? { from: player.id, action } : undefined;
    const errors: string[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, controlled.length) }, async () => {
      while (cursor < controlled.length) {
        const actor = controlled[cursor++]!;
        try { decisions[actor.id] = await provider.decide(previous, actor.id, responseTarget === actor.id ? action : undefined); }
        catch (error) {
          errors.push(actor.name);
          const observation = (await import('./engine.js')).observe(previous, actor.id,
            responseTarget === actor.id ? { from: player.id, text: action.speech } : undefined);
          decisions[actor.id] = demoDecision(observation);
        }
      }
    });
    await Promise.all(workers);
    const next = resolveRound(previous, decisions, undefined, action);
    try {
      if (next.status === 'active') next.history[next.history.length - 1]!.narration = await provider.narrate(next);
      else next.history[next.history.length - 1]!.narration = next.ending ?? '这一段调查到此结束。';
    } catch { next.history[next.history.length - 1]!.narration = demoNarration(next); }
    if (responseTarget && !decisions[responseTarget as ActorId]?.reply && responseTarget !== player.id) {
      const target = next.actors.find(actor => actor.id === responseTarget);
      if (target) {
        const round = next.history[next.history.length - 1]!;
        round.events.push({ id: randomUUID(), round: next.round, actorId: target.id, kind: 'dialogue', locationId: target.locationId,
          text: `${target.name}：“我还需要时间想一想。先让我把眼前的事处理完。”`, visibleTo: [player.id, target.id], private: true, replyTo: player.id });
        for (const idToReceive of [player.id, target.id]) next.actors.find(actor => actor.id === idToReceive)!.memories.push({ id: round.events.at(-1)!.id, round: next.round, locationId: target.locationId, text: round.events.at(-1)!.text });
      }
    }
    store.save(next, previous.revision);
    memoryWorlds.set(next.id, next);
    activeWorldId = next.id;
    walkClock.set(next.id, Date.now());
    return { ...storyState(next.id), warning: errors.length ? `${errors.join('、')}暂时无法连接模型，本轮按各自的离线策略行动。` : '' };
  } finally { turnInProgress = false; }
}

export function currentStoryList() { return store.list().slice(0, 20); }
export function setActiveStory(id: string) {
  if (!store.get(id)) throw new Error('调查记录不存在。');
  activeWorldId = id;
  return storyState(id);
}

