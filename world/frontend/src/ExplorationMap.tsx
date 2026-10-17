import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Expand, FileText, LockKeyhole, Moon, Power, Radio, Sparkles, Volume2, VolumeX } from 'lucide-react';
import Phaser from 'phaser';
import { gap, type useExploration } from './useExploration';
import type { Game } from './types';
import { BootScene, NightScene, type CameraFrame, type SceneBridge } from './game/NightScene';
import { NightAudio } from './game/audio';
import type { NpcPose } from './game/NpcMotion';
import './game/residents.css';

type Controls = ReturnType<typeof useExploration>;
const icons = { notice: FileText, ledger: LockKeyhole, console: Radio, gate: Power, trail: FileText, garden: FileText };

export default function ExplorationMap({ game, controls, selected, disabled, children }: { game: Game | null; controls: Controls; selected: string; disabled: boolean; children?: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const engine = useRef<Phaser.Game | null>(null), audio = useRef(new NightAudio());
  const [camera, setCamera] = useState<CameraFrame>({ x: 0, y: 0, zoom: 2, width: 960, height: 570 });
  const [renderer, setRenderer] = useState('loading'), [error, setError] = useState('');
  const [effects, setEffects] = useState(() => localStorage.getItem('pinecone-fx') !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sound, setSound] = useState(false), [fullScreen, setFullScreen] = useState(false);
  const [npcPoses, setNpcPoses] = useState<Record<string, NpcPose>>({});
  const state = useRef({ game, controls, selected, disabled, effects }); state.current = { game, controls, selected, disabled, effects };
  const powerOff = !!game?.mystery?.power_off;
  useEffect(() => {
    const node = host.current, parent = viewport.current; if (!node || !parent) return;
    let disposed = false;
    const bridge: SceneBridge = {
      read: () => { const snapshot = state.current; return { state: snapshot.game, position: snapshot.controls.readMotion().position, moving: snapshot.controls.moving, direction: snapshot.controls.direction, selected: snapshot.selected, disabled: snapshot.disabled, effects: snapshot.effects, paused: false }; },
      step: (delta, time) => { state.current.controls.advanceFrame(delta, time); if (state.current.controls.moving) audio.current.step(time); },
      camera: frame => { if (!disposed) setCamera(frame); }, ready: value => { if (!disposed) setRenderer(value); },
      interact: id => { void state.current.controls.interact(id); }, error: message => { if (!disposed) setError(message); },
      poses: poses => { if (!disposed) setNpcPoses(poses); },
    };
    const town = new Phaser.Game({
      type: Phaser.AUTO, parent: node, width: node.clientWidth || 960, height: node.clientHeight || 570,
      backgroundColor: '#0c101d', transparent: false, pixelArt: true, roundPixels: true,
      antialias: false, antialiasGL: false, banner: false, audio: { noAudio: true },
      input: { keyboard: false }, scale: { mode: Phaser.Scale.RESIZE },
      scene: [new BootScene(bridge), new NightScene(bridge)],
      render: { preserveDrawingBuffer: true },
    });
    engine.current = town;
    const resize = () => {
      const width = Math.round(parent.clientWidth);
      const height = Math.round(parent.clientHeight) || 600;
      town.scale.resize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(parent); resize();
    const full = () => { setFullScreen(document.fullscreenElement === parent.closest('.night-app')); resize(); };
    document.addEventListener('fullscreenchange', full);
    return () => { disposed = true; observer.disconnect(); document.removeEventListener('fullscreenchange', full); town.destroy(true); engine.current = null; audio.current.close(); };
  }, []);
  useEffect(() => {
    const latest = game?.events.at(-1); if (!latest) return;
    if (latest.kind === 'clue') audio.current.tone(620, .16, .025);
    if (latest.kind === 'anomaly') audio.current.tone(130, .4, .04);
    if (latest.kind === 'ending') audio.current.tone(game?.status === 'won' ? 480 : 100, .6, .03);
  }, [game?.events.at(-1)?.id]);
  const screen = (x: number, y: number) => ({ left: Math.round((x - camera.x) * camera.zoom), top: Math.round((y - camera.y) * camera.zoom) });
  const withinScreen = (x: number, y: number) => { const p = screen(x, y); return p.left > 25 && p.left < camera.width - 25 && p.top > 35 && p.top < camera.height - 35; };
  const interactionTarget = !disabled ? controls.nearest?.id : undefined;
  // Keep just the closest resident's chatter readable rather than piling up
  // bubbles when several people are working around the same noticeboard.
  const chatterTarget = !disabled && !selected ? game?.people.filter(person => {
    const position = npcPoses[person.id]?.position || person.position;
    return position && person.ambient_speech && gap(controls.position, position) <= 64 && withinScreen(position.x, position.y);
  }).sort((a, b) => gap(controls.position, npcPoses[a.id]?.position || a.position!) - gap(controls.position, npcPoses[b.id]?.position || b.position!))[0]?.id : undefined;
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await viewport.current?.closest('.night-app')?.requestFullscreen(); }
    catch { setError('浏览器未允许全屏；仍可在当前窗口游玩。'); }
  };
  return <div ref={viewport} className={`exploration-map phaser-exploration ${powerOff ? 'power-off' : ''}`} data-player-x={Math.round(controls.position.x)} data-player-y={Math.round(controls.position.y)} data-camera-x={camera.x} data-camera-y={camera.y} data-art-source="kenney" data-renderer={renderer} data-pixel-scale={camera.zoom} data-interaction-target={interactionTarget}>
    <div ref={host} className="phaser-world" role="img" aria-label="Phaser 像素世界。WASD 沿小路移动，E 调查。左侧杂货铺，中央广场，右侧舞台，南侧离镇。" />
    <div className="phaser-scene-overlay" aria-label="场景交互点">
      {game?.mystery?.anchors.filter(anchor => withinScreen(anchor.x, anchor.y)).map(anchor => {
        const Icon = icons[anchor.id as keyof typeof icons], near = gap(controls.position, anchor) <= 27;
        const focused = interactionTarget === anchor.id;
        return <button key={anchor.id} data-e-target={focused || undefined} style={screen(anchor.x, anchor.y)} className={`phaser-marker ${focused ? 'near' : ''} ${selected === anchor.id ? 'selected' : ''}`} disabled={!near || disabled} onClick={() => void controls.interact(anchor.id)} aria-label={`调查${anchor.name}${focused ? '，按 E' : near ? '，点击调查' : '，需要靠近'}`}><Icon size={12} /><span>{anchor.name}</span>{focused && <kbd>E</kbd>}</button>;
      })}
      {(game?.people || []).filter(person => person.position && withinScreen((npcPoses[person.id]?.position || person.position).x, (npcPoses[person.id]?.position || person.position).y)).map(person => {
        const pose = npcPoses[person.id];
        const visualPosition = pose?.position || person.position!;
        const near = gap(controls.position, person.position!) <= 31;
        const focused = interactionTarget === person.id, chatter = chatterTarget === person.id;
        return <div key={person.id} className={`phaser-nameplate ${chatter ? 'has-chatter' : ''}`} data-character-id={person.id} data-npc-x={visualPosition.x} data-npc-y={visualPosition.y} data-motion-phase={pose?.phase} data-task-id={person.motion?.task_id} style={screen(visualPosition.x, visualPosition.y)}>
          <button data-e-target={focused || undefined} disabled={!near || disabled} onClick={() => void controls.interact(person.id)} aria-label={`与${person.name}交谈${focused ? '，按 E' : near ? '，点击交谈' : '，需要靠近'}`} className={selected === person.id || focused ? 'selected' : ''}>{person.name}{focused && <span> · E</span>}</button>
          {person.activity && <small className={`npc-activity ${person.thinking ? 'is-thinking' : ''}`}>{person.thinking ? '想想刚才发生的事…' : person.activity}</small>}
          {chatter && <div className="phaser-speech npc-chatter" role="note" aria-label={`${person.name}的自语`} style={{ marginLeft: Math.max(115 - screen(visualPosition.x, visualPosition.y).left, Math.min(0, camera.width - screen(visualPosition.x, visualPosition.y).left - 115)) }}><small>{person.name} · 自语</small><span>{person.ambient_speech}</span></div>}
        </div>;
      })}
    </div>
    <div className="night-weather"><Moon size={13} /> 无风 · 23:45 <span>末班钟前</span></div>
    <div className="phaser-scene-title"><span>松果镇</span><small>AFTER THE CURTAIN</small></div>
    <div className="world-tools"><button onClick={() => { const next = !effects; setEffects(next); localStorage.setItem('pinecone-fx', next ? 'on' : 'off'); }} aria-pressed={effects} aria-label={`光效：${effects ? '开' : '简化'}`} title="切换光效"><Sparkles size={14} /></button><button onClick={() => { void audio.current.toggle().then(setSound); }} aria-pressed={sound} aria-label={`声音：${sound ? '开' : '关'}`} title="合成音效">{sound ? <Volume2 size={14} /> : <VolumeX size={14} />}</button><button onClick={() => void toggleFullscreen()} aria-pressed={fullScreen} aria-label="全屏游戏" title="全屏"><Expand size={14} /></button></div>
    {renderer === 'loading' && <div className="engine-loading"><span />正在点亮夜色…</div>}
    {error && <div className="engine-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭画面提示">×</button></div>}
    {renderer === 'canvas-fallback' && <span className="renderer-fallback">兼容画面 · WebGL 不可用</span>}
    {controls.nearest && !disabled && <div className="nearby-hint"><span><kbd>E</kbd>{['mayor', 'caretaker', 'shopkeeper', 'reporter'].includes(controls.nearest.id) ? '交谈' : '调查'} · {controls.nearest.name}</span>{controls.targetCount > 1 && <button onClick={controls.cycleTarget} aria-label="切换交互目标"><kbd>Q</kbd>切换目标</button>}</div>}
    <div className="touch-controls" aria-label="移动控制">{[['KeyW', ArrowUp], ['KeyA', ArrowLeft], ['KeyS', ArrowDown], ['KeyD', ArrowRight]].map(([code, Icon]) => { const DirectionIcon = Icon as typeof ArrowUp; return <button key={String(code)} className={`touch-${code}`} aria-label={{ KeyW: '向上走', KeyA: '向左走', KeyS: '向下走', KeyD: '向右走' }[String(code)]} disabled={disabled} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); controls.press(String(code)); }} onPointerUp={() => controls.release(String(code))} onPointerCancel={() => controls.release(String(code))} onLostPointerCapture={() => controls.release(String(code))}><DirectionIcon size={17} /></button>; })}<button className="touch-interact" disabled={!controls.nearest || disabled} onClick={() => void controls.interact()} aria-label="按 E 交互">E</button></div>
    {children}
  </div>;
}
