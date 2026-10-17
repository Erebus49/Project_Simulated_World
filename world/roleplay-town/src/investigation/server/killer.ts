import { randomUUID } from 'node:crypto';
import { cocSkillNames, investigatorIds, killerActorIds, type Action, type ActionOption, type Actor, type ActorId, type Check, type CocSkill, type Decision, type GameEvent, type LocationId, type World } from '../shared/types.js';
import { createKillerActors, killerClues, killerOpening, killerPlaces, storyTime } from '../shared/killer.js';
import { actorStartPoint, CLUE_POINTS, distance, EXIT_POINTS, INTERACTION_RANGE, OPERATION_POINTS } from '../shared/scene.js';

const byId = (world: World, id: ActorId) => world.actors.find(a => a.id === id)!;
const place = (id: Actor['locationId']) => killerPlaces.find(p => p.id === id)!;
const has = (a: Actor, ...ids: string[]) => ids.every(id => a.knownClues.includes(id));
const targetPosition = (world: World, id?: string): Actor['position'] => world.actors.find(actor => actor.id === id)?.position;
const magneticKnowledge = (a: Actor) => has(a, 'magnetic-pattern') || has(a, 'yard-magnets', 'archive-magnetism');
function eligible(world: World, actor: Actor, clue: typeof killerClues[number]) {
  const needs = clue.id === 'magnetic-pattern' ? has(actor, 'yard-magnets') && (has(actor, 'night-detour') || has(actor, 'archive-magnetism')) : clue.id === 'well-brood' ? has(actor, 'nasa-map') || has(actor, 'radiation-trail') : (clue.requires ?? []).every(id => has(actor, id));
  return clue.locationId === actor.locationId && !has(actor, clue.id) && needs && world.round >= (clue.minRound ?? 0) && (!clue.nightOnly || storyTime(world.elapsedMinutes).night);
}

export function createKillerWorld(title = '来自群星的杀手', playerActorId: ActorId = 'avery', chosen = false): World {
  if (!investigatorIds.includes(playerActorId as typeof investigatorIds[number])) throw new Error('请选择一名调查员');
  const now = new Date().toISOString();
  const actors = createKillerActors();
  for (const actor of actors) for (const id of actor.knownClues) {
    const clue = killerClues.find(c => c.id === id)!;
    actor.memories.push({ id: randomUUID(), round: 0, locationId: actor.locationId, text: `你知道「${clue.title}」：${clue.text}` });
  }
  for (const actor of actors) actor.position = actorStartPoint(actor.id, actor.locationId);
  return { version: 1, scenarioId: 'killer', playerActorId, id: randomUUID(), title, createdAt: now, updatedAt: now, revision: 0, round: 0, maxRounds: 72, elapsedMinutes: 180, status: 'active', danger: 0, ending: null, actors, history: [{ number: 0, narration: killerOpening, decisions: {}, events: [] }], investigation: { playerChosen: chosen, authoritiesAllied: false, magnetAccess: false, magnetsReady: false, deployedMagnets: 0, contained: false, broodNeutralized: false, attempts: {} } };
}

export function killerActionOptions(world: World, actor: Actor): ActionOption[] {
  if (world.status !== 'active' || actor.hp <= 0) return [];
  const options: ActionOption[] = [];
  const add = (label: string, kind: Action['kind'], target?: string, description?: string, skill?: CocSkill) => {
    const position = kind === 'investigate' ? CLUE_POINTS[target ?? ''] : kind === 'operate' ? OPERATION_POINTS[target ?? ''] : kind === 'move' ? EXIT_POINTS[actor.locationId]?.[target as LocationId] : kind === 'rest' ? actor.position : undefined;
    options.push({ label, action: { kind, ...(target ? { target } : {}), speech: '' }, ...(description ? { description } : {}), ...(skill ? { skill: `${cocSkillNames[skill]} ${actor.skills![skill]}%` } : {}), ...(position ? { position } : {}) });
  };
  if (actor.sanity <= 0) { add('在安全处稳定心神', 'rest'); return options; }
  for (const next of place(actor.locationId).neighbors) {
    if (next === 'lomax-farm' && !has(actor, 'nasa-map') && !(actor.inventory?.includes('盖革计数器'))) continue;
    add(`离开场景 · 前往${place(next).name}`, 'move', next, '走到地图出口后离开当前场景。');
  }
  for (const clue of killerClues.filter(c => eligible(world, actor, c))) add(clue.searchLabel!, 'investigate', clue.id, '仔细检查现场，记录能够验证的发现。', clue.skill);
  for (const other of world.actors.filter(a => a.id !== actor.id && a.locationId === actor.locationId && a.hp > 0)) {
    const position = other.position;
    options.push({ label: `与${other.name}交谈`, action: { kind: 'talk', target: other.id, speech: '' }, ...(position ? { position } : {}) });
    for (const clueId of actor.knownClues) {
      const clue = killerClues.find(candidate => candidate.id === clueId);
      if (clue) options.push({ label: `向${other.name}出示「${clue.title}」`, action: { kind: 'share', target: other.id, clueId, speech: '' }, ...(position ? { position } : {}) });
    }
    if (other.sanity < other.maxSanity - 4 || other.hp < other.maxHp) options.push({ label: `照顾${other.name}`, action: { kind: 'calm', target: other.id, speech: '' }, description: '提供急救或陪伴。', skill: `急救 ${actor.skills!.firstAid}%`, ...(position ? { position } : {}) });
  }
  if (actor.id === world.playerActorId) {
    const state = world.investigation!;
    if (actor.locationId === 'command-post' && !state.authoritiesAllied && actor.knownClues.some(id => ['crash-medical', 'cargo-hole', 'motel-victim'].includes(id))) add('出示证据，申请科研协作', 'operate', 'request-support', '让可检验的事实成为共同语言。', 'persuade');
    if (actor.locationId === 'scrapyard' && magneticKnowledge(actor) && !state.magnetsReady && (state.magnetAccess || state.authoritiesAllied)) add('检修三组电磁铁与供电设备', 'operate', 'prepare-magnets', '修复与校准工业设备，不会关闭小屋现有的保护。', 'electrical');
    if (actor.locationId === 'lomax-farm' && state.magnetsReady && state.deployedMagnets < 3 && state.authoritiesAllied) add(`布置第 ${state.deployedMagnets + 1} 组电磁铁`, 'operate', 'deploy-magnet', '协调军用起重机与技术人员，在井周形成封闭场。', 'heavyMachinery');
    if (actor.locationId === 'lomax-farm' && state.contained && !state.broodNeutralized && has(actor, 'well-brood')) add('协调远程清理，处置胚胎与幼体', 'operate', 'neutralize-brood', '在持续供电下，交由专业队伍远程清理污染源。', 'science');
    if (actor.locationId === 'lomax-farm' && state.contained && !has(actor, 'well-brood')) add('复核井底与污染范围', 'investigate', 'well-brood', '收容完成仍需确认是否存在其他威胁。', 'spotHidden');
    if (actor.locationId === 'lomax-farm' && state.contained) add('将现场移交军方，结束调查', 'operate', 'handover', '现场状况与尚未处理的问题会写入结局。');
    if (actor.locationId === 'checkpoint' && state.authoritiesAllied) add('申请撤离，离开隔离区', 'operate', 'evacuate', '你的调查会结束，未解决的危险将继续存在。');
  }
  add('休息与整理思绪', 'rest');
  return options;
}

export function validateKillerAction(world: World, actor: Actor, action: Action): string | null {
  if (world.status !== 'active') return '调查已经结束，可以从档案中新建战役。';
  if (actor.hp <= 0) return '这名角色已无法继续行动。';
  if (action.kind === 'freeform') return action.speech.trim() ? null : '请描述你想做什么。';
  if (action.kind === 'seal') return '这个战役没有灯塔封印；请根据现场证据制定计划。';
  if (action.kind === 'share') {
    const other = world.actors.find(a => a.id === action.target && a.id !== actor.id && a.locationId === actor.locationId);
    if (!other) return '对方不在当前场景，无法出示证据。';
    if (actor.id === world.playerActorId && (!actor.position || !other.position || distance(actor.position, other.position) > INTERACTION_RANGE)) return '走近对方后才能交谈或出示线索。';
    if (!action.clueId || !has(actor, action.clueId)) return '只能出示自己已经掌握的线索。';
    return null;
  }
  if (['talk', 'calm'].includes(action.kind)) {
    const other = world.actors.find(candidate => candidate.id === action.target && candidate.id !== actor.id && candidate.locationId === actor.locationId);
    if (!other) return '对方不在当前场景。';
    if (actor.id === world.playerActorId && (!actor.position || !other.position || distance(actor.position, other.position) > INTERACTION_RANGE)) return '走近对方后才能进行这项互动。';
  }
  const targetPoint = action.kind === 'investigate' ? CLUE_POINTS[action.target ?? ''] : action.kind === 'operate' ? OPERATION_POINTS[action.target ?? ''] : undefined;
  if (actor.id === world.playerActorId && targetPoint && (!actor.position || distance(actor.position, targetPoint) > INTERACTION_RANGE)) return '你还没有走到这个调查点附近。';
  if (actor.id === world.playerActorId && action.kind === 'move') {
    const exit = EXIT_POINTS[actor.locationId]?.[action.target as Actor['locationId']];
    if (!exit || !actor.position || distance(actor.position, exit) > INTERACTION_RANGE) return '走到场景出口附近后才能前往下一个地点。';
  }
  const match = killerActionOptions(world, actor).some(o => o.action.kind === action.kind && (o.action.target === action.target || action.kind === 'investigate' && !action.target));
  return match ? null : '现在还无法这样行动。请检查所在地点、已知线索和所需设备。';
}

export function killerObjective(world: World, actor: Actor): string {
  if (world.ending) return world.ending;
  const s = world.investigation!;
  if (s.contained) return has(actor, 'well-brood') ? '母体已被限制。持续供电，并确认井底的后代得到妥善处理。' : '异常暂时被限制。结束之前，再确认一次井里有什么。';
  if (s.magnetsReady) return '与 NASA 协作，将三组电磁铁布置到已定位的污染源周围。';
  if (magneticKnowledge(actor)) return '验证磁场假说。争取废品场设备及 NASA 的人员支持。';
  if (has(actor, 'yard-magnets') && (has(actor, 'night-detour') || has(actor, 'archive-magnetism'))) return '比较异常活动与废品场设备，寻找可以重复验证的规律。';
  if (has(actor, 'crash-medical') || has(actor, 'cargo-hole')) return '带着现场证据询问科研人员，也留意夜间与白天的差异。';
  return '探索迫降现场，与哈格雷夫交谈，查明小镇究竟发生了什么。';
}

export function actionDuration(action: Action | undefined): number {
  if (!action) return 10;
  switch (action.kind) {
    case 'move': return 30;
    case 'investigate': return 15;
    case 'talk': return 5;
    case 'share': return 5;
    case 'calm': return 10;
    case 'rest': return 60;
    case 'operate': return 30;
    default: return 10;
  }
}

function needsPersuasionCheck(words: string): boolean {
  if (/你是谁|你叫什么|怎么称呼|做什么的|什么职业|介绍一下/.test(words)) return false;
  return /能不能|可不可以|愿不愿意|帮我|帮忙|合作|协作|借|允许|放行|提供|给我|交出|告诉我|说出|解释|证明|相信|批准|调人|派人|支持|证据|线索|档案|记录|样本|报告|你知道什么|看到什么|发现什么|能说说/.test(words);
}

function declinedRequest(actor: Actor): string {
  if (actor.id === 'buddy') return '先别急着动我的设备。把计划和损坏后的补偿说清楚，我们再谈。';
  if (actor.id === 'hudson') return '我现在还不能调人。把能核实的记录带来，我会重新评估。';
  if (actor.id === 'drako') return '现在不能放行。请先补上可核查的依据，再提交申请。';
  return '这件事我现在还不能答应。等我确认清楚，再给你答复。';
}

function conversationalFallback(actor: Actor, question: string): string {
  if (actor.id === 'morgan' && /伤者|病人|救治|检查|治疗|受伤/.test(question)) return '带我去看看。先确认呼吸和出血情况，其他的等检查完再说。';
  if (actor.id === 'hargrave' && /帮忙|帮我|怎么办|计划/.test(question)) return '先说说你们手里有什么，我来想想能做些什么。';
  if (actor.id === 'buddy' && /磁铁|起重机|设备|借/.test(question)) return '先别急着动设备。告诉我你要拿它做什么，坏了谁负责？';
  if (actor.id === 'pete' && /救|伤者|病人|帮忙/.test(question)) return '我可以帮忙。你先带我去伤者那里，我也得找机会联系家里。';
  const replies: Partial<Record<ActorId, string>> = {
    avery: '我还在核对消息。你想问事故，还是镇上的情况？',
    morgan: '你具体想了解哪一部分？我先把能确认的告诉你。',
    reed: '你想问设备还是事故？我得先看看实际情况。',
    hargrave: '你问吧。我知道的会告诉你，没确认的事我不想乱猜。',
    pete: '你问吧。我知道的就说，不知道的也不会装懂。',
    buddy: '你问具体些，我还得盯着我的设备。',
    hudson: '你具体想核实哪一点？有材料的话我可以查。',
    drako: '说清你要了解的事情，我会告诉你能公开的部分。',
  };
  return replies[actor.id] ?? `${actor.name}看了你一眼：“你想问哪件事？”`;
}

export function resolveKillerRound(previous: World, decisions: Record<ActorId, Decision>, dice: () => number, humanAction?: Action): World {
  if (previous.status !== 'active') throw new Error('调查已经结束');
  const world = structuredClone(previous), s = world.investigation!;
  world.round += 1;
  const events: GameEvent[] = [];
  const emit = (actor: Actor | undefined, kind: GameEvent['kind'], text: string, visibleTo: ActorId[], extra: Partial<GameEvent> = {}) => {
    const event: GameEvent = { id: randomUUID(), round: world.round, ...(actor ? { actorId: actor.id } : {}), kind, text, locationId: actor?.locationId ?? 'gove-motel', visibleTo, private: visibleTo.length < world.actors.length, ...extra };
    events.push(event);
    for (const id of visibleTo) {
      const receiver = byId(world, id);
      receiver.memories.push({ id: event.id, round: world.round, text, locationId: event.locationId });
      receiver.memories = receiver.memories.slice(-80);
    }
    return event;
  };
  const check = (actor: Actor, skill: CocSkill, bonus = 0): Check => {
    const die = dice();
    if (!Number.isInteger(die) || die < 1 || die > 100) throw new Error('百分骰必须在 1–100 之间');
    const dc = Math.max(5, Math.min(95, actor.skills![skill] + bonus));
    const success = die === 1 || die <= dc && die < 96;
    const level = die === 1 ? '大成功' : die >= 96 ? '大失败' : die <= Math.floor(dc / 5) ? '极难成功' : die <= Math.floor(dc / 2) ? '困难成功' : success ? '成功' : '失败';
    return { die, modifier: 0, total: die, dc, success, skill: skill === 'persuade' ? 'persuasion' : skill === 'firstAid' ? 'resolve' : 'investigation', sides: 100, skillName: cocSkillNames[skill], level };
  };
  const grant = (actor: Actor, clueId: string, item = false) => {
    if (has(actor, clueId)) return;
    const clue = killerClues.find(c => c.id === clueId)!;
    actor.knownClues.push(clueId);
    if (item && clueId === 'home-geiger') actor.inventory!.push('盖革计数器');
    if (item && clueId === 'crash-medical') actor.inventory!.push('密封组织样本');
    emit(actor, 'investigate', `记录线索「${clue.title}」：${clue.text}`, [actor.id], { clueIds: [clueId] });
  };
  const finish = (kind: NonNullable<typeof s.endingKind>, text: string, success: boolean) => {
    s.endingKind = kind; world.ending = text; world.status = success ? 'saved' : 'lost';
    emit(undefined, 'world', text, world.actors.map(a => a.id));
  };
  const playerId = world.playerActorId!;
  const player = byId(world, playerId);
  const chosenAction = humanAction ?? decisions[playerId]?.action;
  const oldMinutes = world.elapsedMinutes;
  const newMinutes = oldMinutes + actionDuration(chosenAction);
  world.elapsedMinutes = newMinutes;
  // Player actions resolve first; AI agents then act from their own observations.
  const order = [...world.actors].sort((a, b) => Number(b.id === world.playerActorId) - Number(a.id === world.playerActorId));
  for (const actor of order) {
    if (world.status !== 'active' || actor.hp <= 0) continue;
    const decision = decisions[actor.id];
    if (!decision) throw new Error(`缺少${actor.name}的行动`);
    const action = decision.action;
    if (actor.id !== playerId) {
      const localTarget = action.kind === 'investigate' ? CLUE_POINTS[action.target ?? ''] : action.kind === 'operate' ? OPERATION_POINTS[action.target ?? ''] : undefined;
      if (localTarget) actor.position = { ...localTarget };
      if (['talk', 'share', 'calm'].includes(action.kind) && targetPosition(world, action.target)) {
        const point = targetPosition(world, action.target)!;
        actor.position = { x: point.x - 24, y: point.y + 6 };
      }
    }
    const invalid = validateKillerAction(world, actor, action);
    if (invalid) { emit(actor, 'interrupted', `${actor.name}：${invalid}`, [actor.id]); continue; }
    const local = world.actors.filter(a => a.locationId === actor.locationId).map(a => a.id);
    const target = world.actors.find(a => a.id === action.target);
    const words = action.speech.trim();
    if (action.kind === 'move') {
      const from = actor.locationId;
      actor.locationId = action.target as Actor['locationId'];
      actor.position = actorStartPoint(actor.id, actor.locationId);
      if (!actor.visited.includes(actor.locationId)) actor.visited.push(actor.locationId);
      emit(actor, 'move', `${actor.name}离开${place(from).name}，抵达${place(actor.locationId).name}。${actor.id === world.playerActorId ? place(actor.locationId).description : ''}`, [...new Set([...local, ...world.actors.filter(a => a.locationId === actor.locationId).map(a => a.id)])]);
    } else if (action.kind === 'investigate') {
      const clue = killerClues.find(c => c.id === action.target && (eligible(previous, byId(previous, actor.id), c) || c.id === 'well-brood' && s.contained && actor.locationId === 'lomax-farm' && !has(actor, c.id))) ?? killerClues.find(c => eligible(previous, byId(previous, actor.id), c));
      if (!clue) continue;
      const key = `${actor.id}:${clue.id}`;
      const attempts = s.attempts[key] ?? 0;
      const result = check(actor, clue.skill ?? 'spotHidden', attempts * 10);
      s.attempts[key] = attempts + 1;
      const progressed = result.success || attempts >= 2;
      emit(actor, 'investigate', `${actor.name}${clue.searchLabel}。${progressed ? result.success ? '你发现了可以记录的证据。' : '经过反复排查，你终于记录下关键细节；时间已经过去了。' : '细节还不够清楚。可以换一种思路、询问懂行的人，或稍后再试。'}`, [actor.id], { check: result });
      if (progressed) grant(actor, clue.id, true);
      if (progressed && ['crash-medical', 'well-brood', 'motel-victim'].includes(clue.id)) {
        const san = check(actor, 'psychology', 10);
        const loss = san.success ? 1 : 3;
        actor.sanity = Math.max(0, actor.sanity - loss);
        const sanityCheck: Check = { ...san, skillName: '理智', dc: byId(previous, actor.id).sanity, success: san.die <= byId(previous, actor.id).sanity };
        delete sanityCheck.level;
        emit(actor, 'world', `眼前的景象令人不安。理智 −${loss}。`, [actor.id], { check: sanityCheck });
      }
    } else if (action.kind === 'talk' && target) {
      const evidence = actor.knownClues.some(id => ['crash-medical', 'cargo-hole', 'motel-victim'].includes(id));
      const bonus = target.id === 'hudson' && evidence ? 20 : target.id === 'buddy' && /补偿|钱|赔|购买/.test(words) ? 20 : Math.min(15, actor.relationships[target.id] * 5);
      const result = needsPersuasionCheck(words) ? check(actor, 'persuade', bonus) : undefined;
      emit(actor, 'talk', `${actor.name}对${target.name}说：“${words || '你能告诉我这里发生了什么吗？'}”`, local, result ? { check: result } : {});
      const proposedClue = decisions[target.id]?.shareClueId;
      const willingToShare = Boolean(proposedClue && target.knownClues.includes(proposedClue) && !has(actor, proposedClue) && (proposedClue !== 'patrol-report' || world.round >= 3));
      const shared: string[] = [];
      if (!result || result.success) {
        if (result) {
          actor.relationships[target.id] = Math.min(5, actor.relationships[target.id] + 1);
          target.relationships[actor.id] = Math.min(5, target.relationships[actor.id] + 1);
        }
        if (willingToShare) { grant(actor, proposedClue!); shared.push(proposedClue!); }
        if (target.id === 'hudson' && evidence && actor.id === world.playerActorId && decisions[target.id]?.acceptsCooperation) { s.authoritiesAllied = true; if (!actor.inventory!.includes('NASA 临时顾问证')) actor.inventory!.push('NASA 临时顾问证'); }
        if (target.id === 'buddy' && actor.id === world.playerActorId && decisions[target.id]?.acceptsCooperation && (magneticKnowledge(actor) || /借|设备|磁铁|补偿/.test(words))) s.magnetAccess = true;
      }
      if (actor.id !== playerId) {
        const response = decisions[target.id]?.reply?.trim();
        if (response) emit(target, 'dialogue', `${target.name}：“${response}”`, [actor.id, target.id], { replyTo: actor.id, clueIds: shared });
      } else {
        const refused = Boolean(result && !result.success && (willingToShare || decisions[target.id]?.acceptsCooperation));
        const response = refused ? declinedRequest(target) : decisions[target.id]?.reply?.trim() || conversationalFallback(target, words);
        emit(target, 'dialogue', `${target.name}：“${response}”`, [actor.id, target.id], { replyTo: actor.id, clueIds: shared });
      }
    } else if (action.kind === 'share' && target) {
      grant(target, action.clueId!);
      actor.relationships[target.id] = Math.min(5, actor.relationships[target.id] + 1);
      target.relationships[actor.id] = Math.min(5, target.relationships[actor.id] + 1);
      emit(actor, 'share', `${actor.name}向${target.name}出示了「${killerClues.find(c => c.id === action.clueId)!.title}」。${words}`, [actor.id, target.id]);
    } else if (action.kind === 'calm' && target) {
      const result = check(actor, 'firstAid');
      target.hp = Math.min(target.maxHp, target.hp + (result.success ? 2 : 0));
      target.sanity = Math.min(target.maxSanity, target.sanity + (result.success ? 2 : 1));
      emit(actor, 'calm', `${actor.name}为${target.name}提供照护与支持。${words}`, local, { check: result });
    } else if (action.kind === 'rest') {
      const safe = ['hargrave-home', 'command-post', 'gove-motel'].includes(actor.locationId);
      actor.hp = Math.min(actor.maxHp, actor.hp + (safe ? 1 : 0));
      if (actor.sanity > 0) actor.sanity = Math.min(actor.maxSanity, actor.sanity + (safe ? 1 : 0));
      emit(actor, 'rest', `${actor.name}${safe ? '在相对安全的地方休息、整理思绪（HP 与理智各恢复 1）。' : '停下脚步，留意四周的动静。'}${words}`, local);
    } else if (action.kind === 'operate') {
      if (action.target === 'handover') {
        if (s.broodNeutralized) finish('containment', '三组电磁铁持续供电，母体被困在井周。远程清理队确认胚胎与幼体已被处置。NASA 与军方接管永久收容设施。戈夫镇仍有伤痕，但这一次，新的生命得以继续。', true);
        else finish('incomplete', '你把已收容的异常移交军方，离开了井边。可调查没有确认井底后代的情况。母体被困，并不意味着污染的源头已经全部清除。这份报告仍留下了危险的空白。', false);
        continue;
      }
      if (action.target === 'evacuate') { finish('evacuated', '你获准撤离隔离区，同行者暂时安全。身后的危险却没有消失：没有得到处置的异常继续扩散，镇民仍在等待答案。活着离开，是你的选择；这个故事留下了未竟之事。', false); continue; }
      const skill: CocSkill = action.target === 'request-support' ? 'persuade' : action.target === 'prepare-magnets' ? 'electrical' : action.target === 'deploy-magnet' ? 'heavyMachinery' : 'science';
      const key = `${actor.id}:${action.target}`;
      const result = check(actor, skill, (s.attempts[key] ?? 0) * 10 + (s.authoritiesAllied && action.target !== 'request-support' ? 20 : 0));
      s.attempts[key] = (s.attempts[key] ?? 0) + 1;
      const success = result.success;
      let text = '操作未能完成。设备保持在安全状态，你可以补充准备后再试。';
      if (success && action.target === 'request-support') { s.authoritiesAllied = true; actor.inventory!.push('NASA 临时顾问证'); text = '哈德森认可了你的证据。NASA 提供协作许可、人员与运输支持。'; }
      if (success && action.target === 'prepare-magnets') { s.magnetsReady = true; text = '三组电磁铁完成检修，独立供电与备用燃料已经就绪。现有保护区域仍维持通电。'; }
      if (success && action.target === 'deploy-magnet') { s.deployedMagnets += 1; text = `第 ${s.deployedMagnets} 组电磁铁就位并通电。${s.deployedMagnets === 3 ? '闭合的磁场终于形成，那团不可触碰的微光被限制在井周。' : '磁场还没有闭合，仍需完成剩余设备。'}`; if (s.deployedMagnets === 3) s.contained = true; }
      if (success && action.target === 'neutralize-brood') { s.broodNeutralized = true; text = '远程清理队在持续磁场保护下完成作业。井底的胚胎与胶质幼体被分别处置，复核没有发现残存污染。'; }
      emit(actor, 'operate', text, local, { check: result });
      if (s.contained && s.broodNeutralized) finish('containment', '三组电磁铁持续供电，母体被困在井周。远程清理队确认胚胎与幼体已被处置。NASA 与军方接管永久收容设施。戈夫镇仍有伤痕，但这一次，新的生命得以继续。', true);
    }
  }
  if (world.status === 'active') {
    const before = storyTime(oldMinutes), now = storyTime(newMinutes);
    if (before.day === 1 && before.hour < 6 && now.day === 1 && now.hour >= 6) emit(undefined, 'world', '收音机插播紧急通告：戈夫镇因“炭疽疫情”全面隔离，公路已封闭，19:00 后实行宵禁。NASA 的临时指挥部开始运作。', world.actors.map(a => a.id));
    const nightfalls = Math.max(0, Math.floor((newMinutes - 19 * 60) / 1440) - Math.floor((oldMinutes - 19 * 60) / 1440));
    if (nightfalls > 0) {
      world.danger = Math.min(12, world.danger + (s.contained ? 0 : 2 * nightfalls));
      emit(undefined, 'world', '夜幕降临。无线电里传来新的急救呼叫，巡逻队收紧了封锁。', world.actors.map(a => a.id));
      if (!s.contained) for (const actor of world.actors.filter(a => ['hargrave-home', 'scrapyard'].includes(a.locationId))) {
        grant(actor, 'night-detour');
        if (actor.id === 'pete') emit(actor, 'dialogue', '皮特举起圣经，目送那道微光绕过院子。“你们看，它退却了！”街对面的发电机仍在不停地轰鸣。', world.actors.filter(a => a.locationId === actor.locationId).map(a => a.id));
      }
    }
    const currentPlayer = byId(world, playerId);
    if (now.night && currentPlayer.locationId === 'lomax-farm' && !s.contained && world.danger >= 4) {
      currentPlayer.hp = Math.max(0, currentPlayer.hp - 2); currentPlayer.sanity = Math.max(0, currentPlayer.sanity - 2);
      emit(currentPlayer, 'world', '井周的微光突然向你聚拢。你及时退开，却仍感到一阵被抽空的衰弱（HP −2，理智 −2）。这里在夜间尤为危险。', [currentPlayer.id]);
    }
    if (currentPlayer.hp <= 0 || currentPlayer.sanity <= 0) finish('casualty', '你再也无法继续调查。同伴把你带离危险，而隔离区中的谜团仍未解开。这次行动结束了，存档留下了你曾找到的证据。', false);
    else if (world.round >= world.maxRounds || world.danger >= 12) finish(s.contained ? 'incomplete' : 'overrun', s.contained ? '母体被收容，但井底仍有未经处置的后代。时间耗尽前，清理没有完成，污染继续向土壤深处蔓延。' : '隔离令最终没有阻止灾难。新的异常在农田中蔓延，而每一束微光都意味着更多尚未孵化的生命。你的调查耗尽了时间。', false);
  }
  world.history.push({ number: world.round, narration: '', decisions: structuredClone(decisions), events });
  world.revision += 1; world.updatedAt = new Date().toISOString();
  return world;
}
