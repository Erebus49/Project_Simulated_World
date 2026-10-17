import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Compass, Download, Eye, Feather, FolderOpen, Heart, LoaderCircle, MapPin, Pause, Play, Plus, Radio, Settings2, ShieldCheck, Sparkles, TowerControl, UserRound, Users, X } from 'lucide-react';
import { actorIds, type Action, type ActorId, type SettingsView, type Viewer, type WorldSummary, type WorldView } from '../shared/types';
import { placeById } from '../shared/scenario';
import { download, request, streamTurn } from './api';
import { Portrait } from './components/Portrait';
import { WorldMap } from './components/WorldMap';
import { SettingsDialog } from './components/SettingsDialog';
import { ProfileDialog } from './components/ProfileDialog';
import { CampaignDialog } from './components/CampaignDialog';
import { HumanAction } from './components/HumanAction';
import { Modal } from './components/Modal';

function stored(key: string, fallback = '') { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function remember(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Persistence in SQLite still works when browser storage is unavailable. */ } }
function parseViewer(value: string): Viewer { return value === 'director' || actorIds.includes(value as ActorId) ? value as Viewer : 'director'; }
const initialViewer = parseViewer(stored('fogbound-viewer', 'director'));
let bootstrapPromise: Promise<{ world: WorldView; worlds: WorldSummary[]; settings: SettingsView }> | undefined;
function bootstrap() {
  return bootstrapPromise ??= (async () => {
    const [worlds, settings] = await Promise.all([request<WorldSummary[]>('/api/worlds'), request<SettingsView>('/api/settings')]);
    const last = worlds.find(w => w.id === stored('fogbound-world')) || worlds[0];
    const world = last ? await request<WorldView>(`/api/worlds/${last.id}?viewer=${initialViewer}`) : await request<WorldView>(`/api/worlds?viewer=${initialViewer}`, { method: 'POST', body: '{}' });
    return { world, worlds: last ? worlds : [{ id: world.id, title: world.title, round: world.round, status: world.status, updatedAt: world.updatedAt }], settings };
  })();
}

export default function App() {
  const [world, setWorld] = useState<WorldView | null>(null);
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [viewer, setViewer] = useState<Viewer>(initialViewer);
  const [selectedActor, setSelectedActor] = useState<ActorId>('lin');
  const [selectedPlace, setSelectedPlace] = useState<keyof typeof placeById>('square');
  const [controlled, setControlled] = useState<ActorId | null>(null);
  const [tab, setTab] = useState<'story' | 'events' | 'clues'>('story');
  const [roundIndex, setRoundIndex] = useState(0);
  const [modal, setModal] = useState<'settings' | 'profile' | 'campaigns' | 'help' | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [progress, setProgress] = useState('');
  const [agentStates, setAgentStates] = useState<Partial<Record<ActorId, 'thinking' | 'ready'>>>({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const inFlight = useRef(false);
  const journalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let canceled = false;
    bootstrap().then(data => {
      if (canceled) return;
      setWorld(data.world); setSettings(data.settings); setWorlds(data.worlds); setRoundIndex(data.world.round);
      remember('fogbound-world', data.world.id);
    }).catch(e => { if (!canceled) setError((e as Error).message); });
    return () => { canceled = true; };
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { journalRef.current?.scrollTo({ top: 0 }); }, [roundIndex, tab]);

  const advance = useCallback(async (action?: Action) => {
    if (!world || inFlight.current || viewLoading || world.status !== 'active') return;
    if (controlled && !action) return;
    inFlight.current = true; setBusy(true); setError(''); setAgentStates({}); setRoundIndex(world.round);
    try {
      await streamTurn(`/api/worlds/${world.id}/turn?viewer=${viewer}`, { revision: world.revision, ...(controlled ? { humanActorId: controlled, action } : {}) }, event => {
        if (event.type === 'phase') setProgress(event.message);
        if (event.type === 'agent') setAgentStates(previous => ({ ...previous, [event.actorId]: event.status }));
        if (event.type === 'complete') { setWorld(event.world); setRoundIndex(event.world.round); if (event.world.status !== 'active') setAuto(false); }
      });
      setWorlds(await request<WorldSummary[]>('/api/worlds'));
    } catch (e) { setError((e as Error).message); setAuto(false); }
    finally { inFlight.current = false; setBusy(false); setProgress(''); }
  }, [world, viewer, controlled, viewLoading]);
  useEffect(() => {
    if (!auto || busy || controlled || viewLoading || world?.status !== 'active') return;
    const timer = setTimeout(() => void advance(), 1800);
    return () => clearTimeout(timer);
  }, [auto, busy, controlled, viewLoading, world?.revision, world?.status, advance]);

  async function changeView(next: Viewer) {
    if (!world || busy || viewLoading) return false;
    setAuto(false); setViewLoading(true); setError('');
    try {
      const result = await request<WorldView>(`/api/worlds/${world.id}?viewer=${next}`);
      setViewer(next); setWorld(result); remember('fogbound-viewer', next);
      if (next !== 'director') { setSelectedActor(next); setSelectedPlace(result.actors.find(a => a.id === next)!.locationId!); }
      if (controlled && next !== controlled) setControlled(null);
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setViewLoading(false); }
  }
  async function takeControl() {
    if (!await changeView(selectedActor)) return;
    setControlled(selectedActor); setAuto(false); setModal(null); setRoundIndex(world?.round || 0);
    setToast(`你接管了${world?.actors.find(a => a.id === selectedActor)?.name}。下一步由你决定。`);
  }
  function loaded(next: WorldView) {
    setWorld(next); setViewer(next.viewer); setRoundIndex(next.round); setControlled(null); setAuto(false); setSelectedPlace('square'); setSelectedActor('lin'); setAgentStates({}); setError('');
    remember('fogbound-world', next.id); remember('fogbound-viewer', next.viewer);
    void request<WorldSummary[]>('/api/worlds').then(setWorlds).catch(() => {});
  }
  async function exportFile(backup = false) {
    if (!world) return;
    try { await download(`/api/worlds/${world.id}/${backup ? 'backup' : `export?viewer=${viewer}`}`, `雾港纪事-${world.title}${backup ? '.json' : '.md'}`); setToast(backup ? '完整存档已导出，其中包含所有角色的秘密。' : '这段故事已写入你的战报。'); }
    catch (e) { setError((e as Error).message); }
  }

  if (!world || !settings) return <main className="boot-screen"><div className="brand-mark"><TowerControl size={32} aria-hidden="true" /></div><p className="eyebrow">FOGBOUND</p><h1>一段故事，正在雾里等你。</h1>{error ? <><p className="inline-error" role="alert">{error}</p><button className="button primary" onClick={() => window.location.reload()}>重新连接</button></> : <p className="muted"><LoaderCircle className="spin" size={16} aria-hidden="true" />正在打开冒险档案…</p>}</main>;

  const actor = world.actors.find(a => a.id === selectedActor)!;
  const current = world.history[Math.min(roundIndex, world.history.length - 1)];
  const isPresent = current.number === world.round;
  const scene = placeById[selectedPlace];
  const disabled = busy || viewLoading;
  const minute = world.round * 10;
  const clock = `${18 + Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;

  return <div className="app-shell">
    <a href="#chronicle" className="skip-link">跳到冒险纪事</a>
    <aside className="rail" aria-label="主导航">
      <a className="rail-brand" href="#" aria-label="雾港纪事首页" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><TowerControl size={27} strokeWidth={1.5} aria-hidden="true" /></a>
      <nav><button className="rail-item active" aria-label="查看世界地图" onClick={() => document.getElementById('world-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Compass size={21} aria-hidden="true" /><span>世界</span></button><button className="rail-item" aria-label="查看冒险纪事" onClick={() => { setTab('story'); document.getElementById('chronicle')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><BookOpen size={20} aria-hidden="true" /><span>纪事</span></button><button className="rail-item" aria-label="打开人物档案" onClick={() => setModal('profile')}><Users size={21} aria-hidden="true" /><span>角色</span></button><button className="rail-item" aria-label="打开冒险档案" disabled={disabled} onClick={() => { setAuto(false); setModal('campaigns'); }}><FolderOpen size={21} aria-hidden="true" /><span>档案</span></button></nav>
      <div className="rail-bottom"><button className="rail-item" aria-label="玩法说明" onClick={() => setModal('help')}><CircleHelp size={20} aria-hidden="true" /></button><button className="rail-item" aria-label="模型设置" disabled={disabled} onClick={() => { setAuto(false); setModal('settings'); }}><Settings2 size={20} aria-hidden="true" /></button><span className="rail-version">MVP 01</span></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="wordmark"><span>雾港纪事</span><small>FOGBOUND <i /> A LIVING WORLD</small></div><div className="topbar-actions"><button className="mode-pill" disabled={disabled} onClick={() => { setAuto(false); setModal('settings'); }}><i className="live-dot" />{settings.mode === 'demo' ? '本地演示' : settings.model}<Settings2 size={13} aria-hidden="true" /></button><span className="topbar-divider" /><button className="button quiet" disabled={disabled} onClick={() => { setAuto(false); setModal('campaigns'); }}><Plus size={16} aria-hidden="true" />新的冒险</button></div></header>
      <main className="workspace">
        <section className="campaign-heading" aria-label="当前战役"><div><div className="eyebrow chapter-eyebrow"><span className="tiny-rule" />第一幕 · THE SEVENTH BELL</div><h1>{world.title}<span className="title-period">.</span></h1><p>每个人都有秘密。每个选择，都在改写结局。</p></div><div className="world-clock"><div className="clock-face"><span>{clock}</span><small>雾港 · 入夜</small></div><div className="clock-divider" /><div className="round-counter"><strong>{String(world.round).padStart(2, '0')}<span> / 12</span></strong><small>故事回合</small></div></div></section>
        {error ? <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={17} aria-hidden="true" /></button><button className="text-button" disabled={busy} onClick={async () => { const fresh = await request<WorldView>(`/api/worlds/${world.id}?viewer=${viewer}`).catch(() => null); if (fresh) { setWorld(fresh); setRoundIndex(fresh.round); setError(''); } }}>刷新存档</button></div> : null}
        <div className="stage-grid">
          <div className="world-column">
            <section className="map-panel panel" id="world-map" aria-label="世界地图"><div className="panel-heading"><h2><Compass size={16} aria-hidden="true" />雾港全景<span className="sub-label">WORLD MAP</span></h2><span className="map-weather"><CloudMark />浓雾 · 潮水上涨</span></div><div className="map-stage"><WorldMap actors={world.actors} selected={selectedPlace} onSelect={setSelectedPlace} /><div className="map-scale"><span /><small>港口与周边</small></div><span className="map-tag">A PLACE BETWEEN TIDES</span></div><div className="scene-caption"><div className="scene-pin"><MapPin size={17} aria-hidden="true" /></div><div><h3>{scene.name}<span>{world.actors.filter(a => a.locationId === selectedPlace).length} 人在你的视野中</span></h3><p>{scene.flavor}</p></div><span className="scene-coordinates">{String(scene.x).padStart(3, '0')}° E<br />{String(scene.y).padStart(3, '0')}° N</span></div></section>
            <section className="cast-section" aria-label="故事中的角色"><div className="cast-heading"><h2>故事里的人<span>THE CHARACTERS</span></h2><span>5 个角色，5 种选择</span></div><div className="cast-grid">{world.actors.map(a => <button className={`character-card ${a.id === selectedActor ? 'selected' : ''}`} key={a.id} onClick={() => setSelectedActor(a.id)} aria-pressed={a.id === selectedActor} style={{ '--actor-color': a.color } as React.CSSProperties}><div className="character-portrait"><Portrait id={a.id} /><span className={`role-tag ${a.role === 'NPC' ? 'npc' : ''}`}>{a.role}</span>{busy ? <span className="actor-thinking">{agentStates[a.id] === 'ready' ? <Check size={12} aria-hidden="true" /> : <LoaderCircle size={12} className="spin" aria-hidden="true" />}</span> : controlled === a.id ? <span className="actor-thinking human"><UserRound size={12} aria-hidden="true" /></span> : null}</div><strong>{a.name}</strong><small>{controlled === a.id ? '由你扮演' : a.locationId ? placeById[a.locationId].name : '视野之外'}</small></button>)}</div><button className="actor-preview" onClick={() => setModal('profile')}><span className="actor-preview-icon"><Feather size={17} aria-hidden="true" /></span><span><strong>{actor.name}<span>{actor.subtitle}</span></strong><small>{actor.publicGoal}</small></span><span className="preview-action">人物档案<ChevronRight size={15} aria-hidden="true" /></span></button></section>
            <div className="world-note"><ShieldCheck size={13} aria-hidden="true" /><span>骰点决定结果，角色决定故事。</span><span className="save-state"><Check size={12} aria-hidden="true" />{busy ? '这一轮正在发生' : '所有进展已保存'}</span></div>
          </div>
          <section className="chronicle panel" id="chronicle" aria-label="冒险纪事"><div className="panel-heading"><h2><BookOpen size={16} aria-hidden="true" />冒险纪事<span className="sub-label">CHRONICLE</span></h2><button className="icon-button" aria-label="导出当前视角战报" title="导出当前视角战报" onClick={() => void exportFile()}><Download size={16} aria-hidden="true" /></button></div>
            <div className="perspective-bar"><div className="perspective-toggle" aria-label="观察视角"><button aria-pressed={viewer === 'director'} className={viewer === 'director' ? 'selected' : ''} onClick={() => void changeView('director')} disabled={disabled}><Eye size={13} aria-hidden="true" />导演视角</button><button aria-pressed={viewer !== 'director'} className={viewer !== 'director' ? 'selected' : ''} onClick={() => void changeView(controlled || selectedActor)} disabled={disabled}><UserRound size={13} aria-hidden="true" />{viewer === 'director' ? '角色视角' : `${world.actors.find(a => a.id === viewer)?.name}的视角`}</button></div><span className="perspective-hint">{viewer === 'director' ? '全局故事' : '仅你所知'}</span></div>
            <div className="journal-tabs" role="tablist" aria-label="纪事内容">{[['story', '叙事日志'], ['events', '行动与骰点'], ['clues', `线索手记${viewer === 'director' ? '' : ` · ${world.clues.length}`}`]].map(([id, label]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id as typeof tab)}>{label}</button>)}</div>
            <div className="journal-scroll" ref={journalRef} role="tabpanel" aria-label={tab === 'story' ? '主持人叙事' : tab === 'events' ? '本轮行动记录' : '已知线索'}>
              {tab === 'story' ? <><div className="narrator-label"><span className="narrator-sigil"><Feather size={15} aria-hidden="true" /></span><span>主持人<span>THE GAME MASTER</span></span><span className="round-badge">{current.number === 0 ? '序章' : `第 ${current.number} 轮`}</span></div><div className={`narrative ${world.status !== 'active' && isPresent ? 'ending-narrative' : ''}`}><p className="narrative-kicker">{current.number === 0 ? '雾起之时' : world.status === 'saved' && isPresent ? '雾散之后' : world.status === 'lost' && isPresent ? '最后一声钟鸣' : `夜色里的第 ${current.number} 个选择`}</p>{current.narration.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>{current.number === 0 ? <div className="intro-invitation"><span className="ornament">◇</span><p>世界已经准备好了。<br />让故事开始，或选择一个角色走进去。</p></div> : <button className="text-button show-checks" onClick={() => setTab('events')}>看看这一轮发生了什么<ArrowRight size={14} aria-hidden="true" /></button>}</> : null}
              {tab === 'events' ? current.events.length ? <div className="event-list">{current.events.map(e => <article className={`event-card ${e.private ? 'private-event' : ''}`} key={e.id}><div className="event-topline"><span>{world.actors.find(a => a.id === e.actorId)?.name || '世界'}<small>{placeById[e.locationId].name}</small></span>{e.private ? <span className="private-badge">私有记忆</span> : null}</div><p>{e.text}</p>{e.check ? <div className={`dice-check ${e.check.success ? 'success' : 'failure'}`}><span className="die-value">{e.check.die}</span><span>+ {e.check.modifier} = <strong>{e.check.total}</strong></span><span>DC {e.check.dc}</span><strong>{e.check.success ? '成功' : '失败'}</strong></div> : null}</article>)}</div> : <p className="empty-copy">骰子还未落下。推进一轮，看看角色会做出什么选择。</p> : null}
              {tab === 'clues' ? <><p className="clue-hint">{viewer === 'director' ? '导演可以看到世界中的全部线索。角色只知道自己发现或获知的部分。' : '只有你亲自发现、或他人分享给你的线索会出现在这里。封印需要掌握至少三条。'}</p>{world.clues.length ? <div className="clue-list">{world.clues.map(c => <article className="clue-card" key={c.id}><div className="clue-title"><Sparkles size={15} aria-hidden="true" /><span className="eyebrow">{placeById[c.locationId].name}</span></div><h3>{c.title}</h3><p>{c.text}</p></article>)}</div> : <div className="empty-clues"><BookOpen size={31} strokeWidth={1} aria-hidden="true" /><h3>空白，也是一种开始。</h3><p>探索场景，与人交谈。<br />线索会慢慢拼成答案。</p></div>}</> : null}
            </div>
            <div className="timeline-nav"><button className="icon-button" onClick={() => setRoundIndex(Math.max(0, roundIndex - 1))} disabled={roundIndex <= 0} aria-label="上一轮"><ChevronLeft size={16} aria-hidden="true" /></button><span>{current.number === 0 ? '序章' : `第 ${current.number} 轮`}<i />{isPresent ? '故事的此刻' : '回看往事'}</span><button className="icon-button" onClick={() => setRoundIndex(Math.min(world.round, roundIndex + 1))} disabled={isPresent} aria-label="下一轮"><ChevronRight size={16} aria-hidden="true" /></button></div>
            <div className="story-controls">
              <div className="danger-track"><div><span><Radio size={13} aria-hidden="true" />海雾危机</span><strong>{world.danger < 5 ? '暗流初起' : world.danger < 9 ? '潮水逼近' : '最后的机会'}<small>{world.danger} / 12</small></strong></div><div className="danger-bars" aria-label={`危机 ${world.danger}，上限12`}>{Array.from({ length: 12 }, (_, i) => <i key={i} className={i < world.danger ? 'filled' : ''} />)}</div></div>
              {busy ? <div className="thinking-status" role="status" aria-live="polite"><LoaderCircle className="spin" size={14} aria-hidden="true" /><span>{progress || '故事正在发生…'}</span></div> : null}
              {!isPresent ? <button className="button primary full-width" onClick={() => setRoundIndex(world.round)}>回到故事的此刻<ArrowRight size={16} aria-hidden="true" /></button> : world.status !== 'active' ? <div className="ending-controls"><span>{world.status === 'saved' ? '雾港幸存 · 这段故事已经写完' : '迷失于雾中 · 每个故事都值得再来一次'}</span><button className="button primary full-width" onClick={() => setModal('campaigns')}>开启下一段故事<ArrowRight size={16} aria-hidden="true" /></button></div> : controlled ? <HumanAction world={world} actorId={controlled} busy={disabled} onSubmit={action => void advance(action)} onRelease={() => { setControlled(null); setToast('角色将继续追随自己的选择。'); }} /> : <><div className="play-buttons"><button className="button primary advance-button" disabled={disabled || auto} onClick={() => void advance()}>{busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Feather size={16} aria-hidden="true" />}推进一轮<ArrowRight size={16} aria-hidden="true" /></button><button className={`button secondary auto-button ${auto ? 'playing' : ''}`} onClick={() => setAuto(v => !v)} disabled={viewLoading}>{auto ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}{auto ? '暂停演绎' : '自动演绎'}</button></div><p className="control-hint">{auto ? '角色正追随各自的选择。暂停将在本轮结束后生效。' : '旁观他们的选择，或打开人物档案，亲自成为其中一人。'}</p></>}
            </div>
          </section>
        </div>
        <footer className="workspace-footer"><span>不是每一个秘密，都必须被说出口。</span><button className="text-button" onClick={() => void exportFile(true)}><Download size={12} aria-hidden="true" />导出完整存档</button><span>FOGBOUND <span className="footer-diamond">◇</span> STORIES THAT LIVE</span></footer>
      </main>
    </div>
    {toast ? <div className="toast" role="status"><Check size={16} aria-hidden="true" />{toast}</div> : null}
    {modal === 'settings' ? <SettingsDialog settings={settings} onSave={next => { setSettings(next); setToast('叙事模式已更新，下一轮生效。'); }} onClose={() => setModal(null)} /> : null}
    {modal === 'profile' ? <ProfileDialog key={actor.id} actor={actor} world={world} onClose={() => setModal(null)} onUpdate={setWorld} onView={() => { void changeView(selectedActor); setModal(null); }} onControl={() => void takeControl()} disabled={disabled} /> : null}
    {modal === 'campaigns' ? <CampaignDialog worlds={worlds} currentId={world.id} onLoad={loaded} onClose={() => setModal(null)} /> : null}
    {modal === 'help' ? <Modal title="走进一个正在发生的故事" eyebrow="A SEAT AT THE TABLE" onClose={() => setModal(null)}><div className="help-content"><p>雾港即将被海雾吞没。五个角色有自己的性格、目标和秘密；每推进一轮，他们都会独立做出选择。</p><h3>旁观，或成为其中一人</h3><p>点击「推进一轮」看世界变化；「自动演绎」会持续推进。点击人物卡打开档案，可以查看记忆、编辑设定，或接管角色提交自己的行动。</p><h3>每个人只知道自己知道的</h3><p>导演视角能看见所有人的行动与秘密。角色视角只展示本人知道的线索、在场事件和私有记忆。远处的人在做什么，需要亲自去了解。</p><h3>为雾港写下结局</h3><p>调查场景、分享线索、建立信任。让一名角色掌握至少三条线索，在第十二轮前抵达灯塔，通过意志检定完成封印。失败的封印会加快危机。</p><h3>真实的选择与骰点</h3><p>这是受跑团启发的简化 d20 规则，并非完整 D&amp;D 或 COC。动作结果由代码计算。角色按敏捷从高到低执行；目标已离开时，行动可能中断。</p><p className="field-hint">本地演示使用可解释的角色策略；连接模型后，五个角色和主持人分别调用模型。每轮结束自动保存，可回看、导出和恢复。</p></div></Modal> : null}
  </div>;
}
function CloudMark() { return <svg width="17" height="13" viewBox="0 0 20 14" aria-hidden="true"><path d="M5 10a3.5 3.5 0 0 1-.3-7A5 5 0 0 1 14 4a3 3 0 0 1 1 6H5m-2 3h12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>; }
