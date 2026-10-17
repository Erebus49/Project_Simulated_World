import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionOption, ActorId, ActorView, LocationId, Place, WorldView } from '../investigation/shared/types.js';
import { EXIT_POINTS, INTERACTION_RANGE, SCENE_SIZE, distance, type Point } from '../investigation/shared/scene.js';

const personColors: Record<string, string> = {
  avery: '#c27e47', morgan: '#5f98a2', reed: '#877057', hargrave: '#b59b6b', pete: '#8c956c',
  buddy: '#a56344', hudson: '#587b9a', drako: '#5b6f58',
};

function opening(place: Place) {
  switch (place.id) {
    case 'scrapyard': return { name: '废品场', description: '铁丝网、报废车辆和日夜不息的起重机。', building: 'scrapyard' };
    case 'crash-site': return { name: '迫降现场', description: '草场里横着一艘受损的航天飞机。', building: 'shuttle' };
    case 'gove-motel': return { name: '汽车旅馆', description: '临时隔离点。几扇窗后透出冷白的灯光。', building: 'motel' };
    case 'command-post': return { name: '联合指挥部', description: '帐篷、无线电和临时架起的探照灯。', building: 'camp' };
    case 'lomax-farm': return { name: '废弃农场', description: '旧谷仓与一口被杂草掩住的深井。', building: 'farm' };
    case 'checkpoint': return { name: '公路检查站', description: '路障截断了通往镇外的州际公路。', building: 'checkpoint' };
    default: return { name: '哈格雷夫的家', description: '乡间小屋、门廊与路对面的废品场。', building: 'house' };
  }
}

function targetForAction(option: ActionOption, actors: ActorView[]) {
  if (['talk', 'share', 'calm'].includes(option.action.kind)) return actors.find(actor => actor.id === option.action.target)?.name ?? option.label;
  return option.label;
}

function PixelPerson({ actor, x, y, player = false }: { actor?: ActorView; x: number; y: number; player?: boolean }) {
  const color = player ? '#c18148' : personColors[actor?.id ?? ''] ?? '#7d8d81';
  return <g transform={`translate(${x - 13} ${y - 26})`} className={player ? 'scene-player' : 'scene-person'}>
    <ellipse cx="13" cy="27" rx="12" ry="4" fill="#1b292b" opacity=".38" />
    <rect x="6" y="14" width="14" height="12" rx="2" fill="#273234" />
    <rect x="8" y="15" width="10" height="10" rx="1" fill={color} />
    <rect x="6" y="17" width="3" height="7" fill="#d8b28b" />
    <rect x="17" y="17" width="3" height="7" fill="#c69d7c" />
    <rect x="8" y="24" width="4" height="5" fill="#35484a" />
    <rect x="14" y="24" width="4" height="5" fill="#26373d" />
    <rect x="6" y="4" width="14" height="12" rx="5" fill="#342d2b" />
    <rect x="7" y="8" width="12" height="8" rx="4" fill="#ddba98" />
    <rect x="6" y="5" width="14" height="5" rx="3" fill={actor?.id === 'pete' ? '#ded7c0' : '#4c3d34'} />
    {actor?.id === 'reed' ? <><rect x="8" y="10" width="4" height="2" fill="#3b484a"/><rect x="14" y="10" width="4" height="2" fill="#3b484a"/></> : null}
    {actor ? <text x="13" y="-4" textAnchor="middle" className="scene-person-label">{actor.name}</text> : <text x="13" y="-4" textAnchor="middle" className="scene-player-label">你</text>}
  </g>;
}

function SceneBackdrop({ locationId }: { locationId: LocationId }) {
  const scene = opening({ id: locationId } as Place);
  return <g aria-hidden="true">
    <rect width="1000" height="640" fill={locationId === 'command-post' || locationId === 'checkpoint' ? '#849071' : '#88976c'} />
    <path d="M0 115 Q180 77 300 116 T610 108 T1000 122 V0 H0Z" fill="#97a17a" opacity=".58" />
    <path d="M0 548 Q130 510 270 548 T570 543 T1000 560 V640 H0Z" fill="#64775e" opacity=".55" />
    <path d="M-30 340 C180 300 260 360 430 335 S720 290 1030 350" fill="none" stroke="#b99f72" strokeWidth="104" />
    <path d="M-30 340 C180 300 260 360 430 335 S720 290 1030 350" fill="none" stroke="#d2bd93" strokeWidth="80" />
    <path d="M0 341 C200 304 270 355 430 335 S720 296 1000 351" fill="none" stroke="#b9a47d" strokeWidth="2" strokeDasharray="18 17" opacity=".7" />
    <g opacity=".82">
      {Array.from({ length: 17 }, (_, i) => <g key={i} transform={`translate(${32 + (i * 137) % 945} ${40 + (i * 83) % 553})`}>
        <circle r="17" fill="#53694f"/><circle cx="-4" cy="-5" r="10" fill="#6f805b"/><rect x="-3" y="8" width="6" height="12" fill="#63523d"/>
      </g>)}
    </g>
    {scene.building === 'house' ? <g>
      <rect x="315" y="170" width="260" height="170" fill="#d8c6a2" stroke="#483d35" strokeWidth="8" />
      <path d="M290 181 445 88 605 181Z" fill="#66534a" stroke="#403832" strokeWidth="9" />
      <path d="M338 191h60v56h-60zm95 0h69v55h-69z" fill="#62717a" stroke="#5e4c3d" strokeWidth="7" />
      <rect x="415" y="263" width="58" height="77" fill="#77604b"/><path d="M396 341h96" stroke="#584936" strokeWidth="12"/>
      <rect x="360" y="145" width="169" height="11" fill="#8e7558"/>
    </g> : null}
    {scene.building === 'scrapyard' ? <g>
      <path d="M100 110H900V545H100Z" fill="none" stroke="#453f35" strokeWidth="8" strokeDasharray="18 8" />
      {[[190,220],[340,260],[700,190],[770,390],[285,425]].map(([x,y], i) => <g key={i} transform={`translate(${x} ${y})`}>
        <rect x="-54" y="-28" width="105" height="56" rx="13" fill={['#52606a','#6d5c48','#536b62','#79614c','#546170'][i]} stroke="#443b33" strokeWidth="7"/>
        <rect x="-31" y="-19" width="50" height="16" fill="#85918c" opacity=".62"/>
        <circle cx="-29" cy="30" r="12" fill="#322f2d"/><circle cx="30" cy="30" r="12" fill="#322f2d"/>
      </g>)}
      <path d="M625 135v180h-40M630 140h160" stroke="#51483c" strokeWidth="11"/><path d="M772 133v120" stroke="#575042" strokeWidth="7"/><circle cx="775" cy="258" r="29" fill="#7a6d50" stroke="#453e33" strokeWidth="6"/>
      <path d="M790 257V178M860 257V178" stroke="#5b4738" strokeWidth="8"/><path d="M777 178h96" stroke="#4f493e" strokeWidth="9"/>
    </g> : null}
    {scene.building === 'shuttle' ? <g>
      <path d="M215 235 677 220 758 278 642 319 287 304Z" fill="#c8c8b8" stroke="#525657" strokeWidth="9"/>
      <path d="m395 245 155-118 56-8-81 132m-106 52-147 95-42 2 86-99" fill="#737e83" stroke="#505556" strokeWidth="8"/>
      <path d="M653 235 799 204l57 36-116 35" fill="#7d8a8c" stroke="#505556" strokeWidth="8"/>
      <path d="M300 270h260" stroke="#929992" strokeWidth="8"/><path d="M490 229 530 234" stroke="#738195" strokeWidth="12"/>
      <path d="M150 90 220 72 245 104 164 126Z" fill="#bdaa7b" opacity=".7"/>
    </g> : null}
    {scene.building === 'motel' ? <g>
      <rect x="226" y="140" width="540" height="148" fill="#c8b89a" stroke="#55483b" strokeWidth="8"/>
      <path d="M205 147h583v-32H205Z" fill="#8f5650" stroke="#55483b" strokeWidth="7"/>
      {Array.from({ length: 7 }, (_, i) => <g key={i} transform={`translate(${258 + i * 70} 183)`}>
        <rect width="54" height="69" fill="#515f63" stroke="#796953" strokeWidth="6"/><rect x="8" y="8" width="38" height="28" fill={i % 3 === 0 ? '#d5b986' : '#71838a'}/><rect x="20" y="42" width="17" height="27" fill="#776146"/>
      </g>)}
      <path d="M270 315H715" stroke="#746858" strokeWidth="11"/><path d="M260 327v28m65-28v28m65-28v28m65-28v28m65-28v28m65-28v28" stroke="#e1d5b9" strokeWidth="4"/>
      <rect x="815" y="158" width="90" height="94" fill="#aa6252" stroke="#584638" strokeWidth="6"/><text x="860" y="202" textAnchor="middle" className="scene-sign">MOTEL</text>
    </g> : null}
    {scene.building === 'camp' ? <g>
      <path d="m256 272 94-108 96 108Z" fill="#dad1ba" stroke="#746a54" strokeWidth="7"/><path d="M350 164v108" stroke="#806e58" strokeWidth="6"/>
      <path d="m540 300 84-101 87 101Z" fill="#d1c9b3" stroke="#776c57" strokeWidth="7"/><path d="M624 200v100" stroke="#776c57" strokeWidth="6"/>
      <rect x="438" y="334" width="220" height="95" rx="12" fill="#68757a" stroke="#485252" strokeWidth="8"/><rect x="466" y="349" width="100" height="43" fill="#92a2a0"/><circle cx="478" cy="438" r="17" fill="#292f31"/><circle cx="626" cy="438" r="17" fill="#292f31"/>
      <path d="M691 144v152m-25-141h50" stroke="#494c44" strokeWidth="8"/><path d="M666 156q25-26 50 0" fill="none" stroke="#d5c69b" strokeWidth="3"/>
    </g> : null}
    {scene.building === 'farm' ? <g>
      <path d="M244 283v-116l150-82 152 82v116Z" fill="#9a5c48" stroke="#553e33" strokeWidth="8"/><path d="M215 177 394 69 576 177Z" fill="#78463d" stroke="#493933" strokeWidth="8"/>
      <path d="M350 283v-89h86v89" fill="#5c4738" stroke="#d2b981" strokeWidth="7"/><path d="M276 194h45v38h-45zM463 194h44v38h-44z" fill="#697b7b" stroke="#654a3b" strokeWidth="6"/>
      <ellipse cx="756" cy="396" rx="84" ry="49" fill="#645a45"/><ellipse cx="756" cy="388" rx="58" ry="29" fill="#4d6570" stroke="#b9ab88" strokeWidth="10"/><path d="M696 384h120" stroke="#c1b492" strokeWidth="9"/>
      <path d="M104 110v420m36-420v420m36-420v420m36-420v420" stroke="#9ead78" strokeWidth="5" opacity=".65"/>
    </g> : null}
    {scene.building === 'checkpoint' ? <g>
      <path d="M0 256h1000v149H0Z" fill="#52585a"/><path d="M0 325h1000" stroke="#c1b99d" strokeWidth="7" strokeDasharray="48 38"/>
      <path d="M256 243v178m489-178v178" stroke="#6e5341" strokeWidth="16"/><path d="M256 246h-75v27h105m459-27h75v27H715" fill="#ede5cf" stroke="#5d4b3d" strokeWidth="7"/>
      <path d="M285 237 392 158h221l109 79" fill="#9c8b68" stroke="#5f5749" strokeWidth="8"/><path d="M391 158v79m220-79v79" stroke="#6a5b49" strokeWidth="7"/>
      <rect x="464" y="277" width="100" height="36" rx="8" fill="#73858a" stroke="#3e4a4d" strokeWidth="7"/><circle cx="481" cy="316" r="13" fill="#282d30"/><circle cx="548" cy="316" r="13" fill="#282d30"/>
    </g> : null}
    {scene.building === 'house' ? <path d="M85 70v85m26-85v85M804 80v72m25-72v72" stroke="#d1c3a1" strokeWidth="9"/> : null}
    <path d="M30 75h154" stroke="#44584a" strokeWidth="3" opacity=".3"/><path d="M800 530h160" stroke="#44584a" strokeWidth="3" opacity=".3"/>
  </g>;
}

export interface InvestigationMapProps {
  world: WorldView;
  busy: boolean;
  onWalk: (point: Point) => Promise<unknown>;
  onAction: (action: ActionOption['action'], position: Point) => void;
}

export function InvestigationMap({ world, busy, onWalk, onAction }: InvestigationMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const keys = useRef(new Set<string>()), positionRef = useRef<Point>({ x: 450, y: 510 });
  const clickTarget = useRef<Point | null>(null), syncing = useRef(false), lastSync = useRef(0);
  const [position, setPosition] = useState<Point>(world.actors.find(actor => actor.id === world.playerActorId)?.position ?? { x: 450, y: 510 });
  const [queuedAction, setQueuedAction] = useState<ActionOption | null>(null);
  const [selectedActor, setSelectedActor] = useState<ActorId | null>(null);
  const player = world.actors.find(actor => actor.id === world.playerActorId)!;
  const playerLocation = player.locationId ?? 'hargrave-home';
  const currentPlace = world.places.find(place => place.id === playerLocation)!;
  const actorsHere = world.actors.filter(actor => actor.id !== player.id && actor.locationId === playerLocation && actor.hp > 0);
  const exits = EXIT_POINTS[playerLocation] ?? {};
  const actorsById = useMemo(() => new Map(world.actors.map(actor => [actor.id, actor])), [world.actors]);
  const available = world.availableActions ?? [];
  const chosenActorOptions = selectedActor ? available.filter(option => option.action.target === selectedActor && ['talk', 'share', 'calm'].includes(option.action.kind)) : [];
  const currentOptionNear = queuedAction?.position ? distance(position, queuedAction.position) <= INTERACTION_RANGE : queuedAction?.action.kind === 'rest';
  const selectedPlace = opening(currentPlace);

  useEffect(() => { const point = player.position ?? { x: 450, y: 510 }; positionRef.current = point; setPosition(point); setQueuedAction(null); setSelectedActor(null); clickTarget.current = null; }, [player.locationId]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) return;
      const key = event.key.toLowerCase();
      if (['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(key)) { event.preventDefault(); keys.current.add(key); }
      if (key === 'escape') { clickTarget.current = null; setQueuedAction(null); setSelectedActor(null); }
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    const stop = () => keys.current.clear(); window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', stop); };
  }, []);

  useEffect(() => {
    let frame = 0, last = performance.now(), movingBudget = 0;
    const animate = (now: number) => {
      const delta = Math.min(40, now - last); last = now;
      if (!busy) {
        let dx = 0, dy = 0;
        const held = keys.current;
        if (held.has('a') || held.has('arrowleft')) dx -= 1;
        if (held.has('d') || held.has('arrowright')) dx += 1;
        if (held.has('w') || held.has('arrowup')) dy -= 1;
        if (held.has('s') || held.has('arrowdown')) dy += 1;
        const goal = clickTarget.current;
        if (!dx && !dy && goal) { dx = goal.x - positionRef.current.x; dy = goal.y - positionRef.current.y; if (Math.hypot(dx, dy) < 8) { dx = 0; dy = 0; clickTarget.current = null; } }
        const length = Math.hypot(dx, dy);
        if (length) {
          const step = 0.18 * delta, next = { x: Math.max(32, Math.min(968, positionRef.current.x + dx / length * step)), y: Math.max(32, Math.min(608, positionRef.current.y + dy / length * step)) };
          positionRef.current = next; setPosition(next); movingBudget += delta;
          if (movingBudget >= 240 && !syncing.current && distance(next, world.actors.find(actor => actor.id === player.id)?.position ?? next) > 18) {
            syncing.current = true; movingBudget = 0; lastSync.current = now;
            void onWalk(next).finally(() => { syncing.current = false; });
          }
          if (queuedAction?.position && distance(next, queuedAction.position) < INTERACTION_RANGE * 0.86 && clickTarget.current) clickTarget.current = null;
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [busy, onWalk, player.id, queuedAction, world.actors]);

  function svgPoint(event: { clientX: number; clientY: number }) {
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return positionRef.current;
    const scale = Math.min(rect.width / SCENE_SIZE.width, rect.height / SCENE_SIZE.height);
    const ox = (rect.width - SCENE_SIZE.width * scale) / 2, oy = (rect.height - SCENE_SIZE.height * scale) / 2;
    return { x: (event.clientX - rect.left - ox) / scale, y: (event.clientY - rect.top - oy) / scale };
  }
  function setTarget(option: ActionOption) {
    setQueuedAction(option); setSelectedActor(null);
    if (option.position && distance(positionRef.current, option.position) > INTERACTION_RANGE) clickTarget.current = { x: option.position.x - 15, y: option.position.y + 8 };
  }
  function confirm(option = queuedAction) {
    if (!option || busy || (option.position && distance(positionRef.current, option.position) > INTERACTION_RANGE)) return;
    onAction({ ...option.action, speech: option.action.speech || '' }, positionRef.current);
    setQueuedAction(null); setSelectedActor(null); clickTarget.current = null;
  }
  const clueOptions = available.filter(option => option.action.kind === 'investigate' || option.action.kind === 'operate');
  const actorOptions = available.filter(option => ['talk', 'share', 'calm'].includes(option.action.kind));
  const listedActors = actorsHere.filter(actor => actor.position);
  const exitLabel = queuedAction?.action.kind === 'move' ? world.places.find(place => place.id === queuedAction.action.target)?.name : null;

  return <section className="investigation-map-panel" aria-label={`${currentPlace.name} 2D 场景地图`}>
    <div className="scene-title"><div><span className="scene-kicker">场景箱庭 · {world.round.toString().padStart(2, '0')} 次行动</span><h2>{currentPlace.name}</h2><p>{selectedPlace.description}</p></div><div className="scene-location-tag"><i/>{world.status === 'active' ? '现场开放探索' : '调查已结束'}</div></div>
    <div className="scene-viewport">
      <svg ref={svgRef} className="scene-svg" viewBox="0 0 1000 640" role="img" aria-label={`${currentPlace.name}，使用 WASD 或方向键探索，靠近标记交互。`} onPointerDown={event => { if (busy) return; const point = svgPoint(event); if ((event.target as Element).closest('[data-interactive="true"]')) return; clickTarget.current = point; setQueuedAction(null); setSelectedActor(null); }}>
        <defs>
          <pattern id="scene-grain" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M3 9h4m18 17h5M11 30h2M29 5h2" stroke="#53674f" opacity=".19" strokeWidth="2"/><circle cx="16" cy="7" r="1" fill="#e3d3a5" opacity=".36"/></pattern>
          <linearGradient id="scene-vignette" x2="0" y2="1"><stop stopColor="#172323" stopOpacity=".26"/><stop offset=".35" stopColor="#172323" stopOpacity="0"/><stop offset="1" stopColor="#172323" stopOpacity=".2"/></linearGradient>
          <filter id="soft-shadow" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="8"/></filter>
        </defs>
        <SceneBackdrop locationId={playerLocation}/><rect width="1000" height="640" fill="url(#scene-grain)"/>
        <path d="M0 530Q220 500 420 530T1000 522" fill="none" stroke="#cdb38b" strokeWidth="3" opacity=".56"/>
        <path d="M30 53h220M728 52h242" stroke="#e6d3ac" strokeWidth="2" opacity=".3"/>
        {clueOptions.map((option, index) => {
          const point = option.position ?? { x: 350 + index * 54, y: 430 };
          const selected = queuedAction?.action.target === option.action.target && queuedAction?.action.kind === option.action.kind;
          return <g key={`${option.action.kind}:${option.action.target}`} data-interactive="true" role="button" tabIndex={busy ? -1 : 0} aria-label={`${option.label}，${distance(position, point) <= INTERACTION_RANGE ? '可交互' : '走近后可交互'}`} className={`scene-hotspot ${selected ? 'selected' : ''}`} transform={`translate(${point.x} ${point.y})`} onPointerDown={event => { event.stopPropagation(); setTarget(option); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setTarget(option); } }}>
            <circle r="27" className="hotspot-halo"/><path d="M0-19 17-2 0 19-17-2Z" className="hotspot-diamond"/><text y="5" textAnchor="middle" className="hotspot-glyph">{option.action.kind === 'operate' ? '⚙' : '?'}</text>
            <text y="43" textAnchor="middle" className="hotspot-label">{option.label.length > 12 ? `${option.label.slice(0, 11)}…` : option.label}</text>
          </g>;
        })}
        {world.clues.map(clue => {
          const position = (world.places.find(place => place.id === clue.locationId)?.id === player.locationId) ? available.find(option => option.action.target === clue.id)?.position : undefined;
          return clue.locationId === player.locationId && position ? <g key={clue.id} transform={`translate(${position.x} ${position.y})`} className="found-clue"><circle r="18"/><text y="5" textAnchor="middle">✓</text></g> : null;
        })}
        {listedActors.map(actor => {
          const point = actor.position!; const choices = actorOptions.filter(option => option.action.target === actor.id);
          const selected = selectedActor === actor.id;
          return <g key={actor.id} data-interactive="true" role="button" tabIndex={busy ? -1 : 0} aria-label={`${actor.name}，${distance(position, point) <= INTERACTION_RANGE ? '在互动距离内' : '走近后可互动'}`} className={`scene-actor-marker ${selected ? 'selected' : ''}`} onPointerDown={event => { event.stopPropagation(); setQueuedAction(null); if (distance(positionRef.current, point) <= INTERACTION_RANGE) setSelectedActor(selected ? null : actor.id); else { setSelectedActor(actor.id); clickTarget.current = { x: point.x - 38, y: point.y + 15 }; } }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setSelectedActor(actor.id); } }}>
            <circle cx={point.x} cy={point.y} r="34" className="actor-range"/><PixelPerson actor={actor} x={point.x} y={point.y}/>
            {choices.length ? <circle cx={point.x + 17} cy={point.y - 22} r="8" className="actor-interact-dot"/> : null}
          </g>;
        })}
        {Object.entries(exits as Record<string, Point>).map(([destination, point]) => {
          if (!point) return null;
          const nearby = distance(position, point) < 75;
          return <g key={destination} data-interactive="true" role="button" tabIndex={busy ? -1 : 0} aria-label={`场景出口，前往${world.places.find(place => place.id === destination)?.name}`} className={`scene-exit ${nearby ? 'nearby' : ''}`} transform={`translate(${point.x} ${point.y})`} onPointerDown={event => { event.stopPropagation(); const option = available.find(item => item.action.kind === 'move' && item.action.target === destination); if (option) setTarget(option); else clickTarget.current = point; }}>
            <path d="M-30 0V-24Q0-56 30-24V0Z" className="exit-arch"/><path d="M-21 0V-22Q0-42 21-22V0" className="exit-door"/><text y="21" textAnchor="middle" className="exit-label">出口 · {world.places.find(place => place.id === destination)?.name}</text>
          </g>;
        })}
        {queuedAction?.position && distance(position, queuedAction.position) < INTERACTION_RANGE ? <circle cx={queuedAction.position.x} cy={queuedAction.position.y} r="46" className="interaction-range-ring"/> : null}
        <PixelPerson x={position.x} y={position.y} player/>
        <rect width="1000" height="640" fill="url(#scene-vignette)" pointerEvents="none"/>
        <text x="25" y="34" className="map-coordinate">SCENE / {playerLocation.toUpperCase()}</text>
        <text x="973" y="34" textAnchor="end" className="map-coordinate">{world.round.toString().padStart(2, '0')} · ACTION</text>
      </svg>
      <div className="scene-hud"><span className="hud-indicator"><i/>你的调查员</span><span>WASD 移动 <b>·</b> 点击地面行走 <b>·</b> 靠近标记互动</span></div>
      <div className="scene-mobile-pad" aria-label="移动方向">
        <button onPointerDown={() => keys.current.add('arrowup')} onPointerUp={() => keys.current.delete('arrowup')} onPointerLeave={() => keys.current.delete('arrowup')} aria-label="向上走">↑</button>
        <button onPointerDown={() => keys.current.add('arrowleft')} onPointerUp={() => keys.current.delete('arrowleft')} onPointerLeave={() => keys.current.delete('arrowleft')} aria-label="向左走">←</button>
        <button onPointerDown={() => keys.current.add('arrowdown')} onPointerUp={() => keys.current.delete('arrowdown')} onPointerLeave={() => keys.current.delete('arrowdown')} aria-label="向下走">↓</button>
        <button onPointerDown={() => keys.current.add('arrowright')} onPointerUp={() => keys.current.delete('arrowright')} onPointerLeave={() => keys.current.delete('arrowright')} aria-label="向右走">→</button>
      </div>
      {selectedActor && chosenActorOptions.length && distance(position, actorsById.get(selectedActor)?.position ?? position) <= INTERACTION_RANGE ? <div className="scene-action-popover" role="group" aria-label={`与${actorsById.get(selectedActor)?.name}互动`}>
        <span><strong>{actorsById.get(selectedActor)?.name}</strong><small>{actorsById.get(selectedActor)?.subtitle}</small></span>
        <div>{chosenActorOptions.map(option => <button key={`${option.action.kind}:${option.action.clueId ?? ''}`} disabled={busy} onClick={() => confirm(option)}>{option.action.kind === 'talk' ? '交谈' : option.action.kind === 'share' ? '出示线索' : '照护'}{option.action.kind === 'share' ? ` · ${world.clues.find(clue => clue.id === option.action.clueId)?.title ?? '线索'}` : ''}</button>)}</div>
      </div> : null}
      {selectedActor && chosenActorOptions.length && distance(position, actorsById.get(selectedActor)?.position ?? position) > INTERACTION_RANGE ? <button className="scene-arrive-prompt" onClick={() => { const person = actorsById.get(selectedActor); if (person?.position) clickTarget.current = { x: person.position.x - 38, y: person.position.y + 15 }; }}>走近 {actorsById.get(selectedActor)?.name}</button> : null}
      {queuedAction ? <div className="scene-context-card" role="status"><div><small>{exitLabel ? '场景出口' : selectedActor ? '人物互动' : '调查目标'}</small><strong>{targetForAction(queuedAction, world.actors)}</strong><span>{currentOptionNear ? queuedAction.description || queuedAction.skill || '你已走到互动距离。' : '正在前往目标，靠近后可以互动。'}</span></div>{queuedAction.action.kind === 'move' ? <button disabled={busy || !currentOptionNear} onClick={() => confirm()}>离开场景</button> : <button disabled={busy || !currentOptionNear} onClick={() => confirm()}>{busy ? '结算中…' : '开始互动'}</button>}</div> : null}
      {actorsHere.length === 0 ? <div className="scene-empty-presence">现场暂时没有其他人在这里。</div> : null}
    </div>
    <div className="scene-bottom-bar"><div className="nearby-objects"><span>本场景可做</span>{[...clueOptions, ...actorOptions.filter(option => option.action.kind === 'talk')].slice(0, 5).map(option => <button key={`${option.action.kind}:${option.action.target}`} disabled={busy} onClick={() => setTarget(option)}>{option.action.kind === 'talk' ? `找 ${world.actors.find(actor => actor.id === option.action.target)?.name ?? '居民'}` : option.action.kind === 'operate' ? '操作设备' : '调查现场'}</button>)}{available.find(option => option.action.kind === 'rest') ? <button disabled={busy} onClick={() => confirm(available.find(option => option.action.kind === 'rest'))}>休整</button> : null}</div><div className="scene-neighbors"><span>可以前往</span>{currentPlace.neighbors.map(id => <button key={id} disabled={busy} onClick={() => { const option = available.find(item => item.action.kind === 'move' && item.action.target === id); if (option) setTarget(option); }}><b>↗</b>{world.places.find(place => place.id === id)?.name}</button>)}</div></div>
  </section>;
}

