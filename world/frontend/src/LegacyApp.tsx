import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Code2, Compass, Eye, Flag, History, Info, KeyRound, Leaf, LoaderCircle, LockKeyhole, MapPin, MessageCircle, MoreHorizontal, Package, Plus, Radio, Send, Settings2, ShieldCheck, Sparkles, Sprout, Volume2, X } from 'lucide-react';
import PixelMap, { PixelPerson, rooms } from './PixelMap';
import { api, type Action, type Game, type Person, type Scenario, type Settings, type WorldEvent } from './types';

const operationNames: Record<string, string> = { unlock_stage: '用钥匙打开舞台', inspect_stage: '继续安全检查', install_speaker: '安装备用音箱', allocate_stall: '确认庆典摊位', interview: '进行采访' };
const initialSettings: Settings = { base_url: 'https://api.openai.com/v1', model: '', has_api_key: false, timeout_seconds: 10 };

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,a[href]') || []);
    focusable()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = focusable(), first = list[0], last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><div><span className="eyebrow">PINECONE TOWN</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button></header>{children}</div></div>;
}

function EventCard({ entry, people, onSelect }: { entry: WorldEvent; people: Person[]; onSelect: (id: string) => void }) {
  const person = people.find(p => p.id === entry.actor_id);
  if (entry.kind === 'observe' || entry.kind === 'opening') return <div className="system-event"><span className="event-dot" /><p>{entry.text}</p></div>;
  if (entry.kind === 'speak') return <article className="event-dialogue"><button className="event-avatar" style={{ background: `${person?.color || '#b1b8a6'}33` }} onClick={() => onSelect(entry.actor_id)} aria-label={`选择${person?.name || '角色'}`}><PixelPerson id={entry.actor_id} color={person?.color || '#aaa'} size={23} /></button><div className="event-dialogue-body"><div className="event-author">{person?.name || '角色'}<span>{entry.details.private ? <><LockKeyhole size={10} />悄悄话</> : person?.role}</span><time>#{String(entry.turn).padStart(2, '0')}</time></div><p>{entry.details.message}</p>{entry.details.target_id && <span className="said-to">对 {people.find(p => p.id === entry.details.target_id)?.name || '对方'}</span>}</div></article>;
  return <div className={`action-event ${entry.kind === 'ending' ? 'ending-event' : ''}`}><span className="action-event-icon">{entry.kind === 'move' ? <MapPin size={13} /> : entry.kind === 'give' ? <Package size={13} /> : entry.kind === 'ending' ? <Flag size={13} /> : <Sparkles size={13} />}</span><p>{entry.text}</p><time>#{entry.turn}</time></div>;
}

function DebugPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [data, setData] = useState<any>(null), [actor, setActor] = useState('shopkeeper'), [tab, setTab] = useState('roles'), [error, setError] = useState('');
  useEffect(() => { api(`/debug/games/${game.id}`).then(setData).catch(e => setError(e.message)); }, [game.id, game.version, game.busy]);
  const call = data?.calls.find((c: any) => c.character_id === actor);
  return <section className="debug-panel"><div className="debug-title"><div><span className="eyebrow">BEHIND THE SCENES</span><h2>世界的另一面</h2><p>这是调试视角，包含玩家和其他角色不知道的信息。</p></div><button className="secondary-button" onClick={onClose}><ArrowLeft size={15} />回到小镇</button></div><div className="debug-tabs">{[['roles', '独立角色'], ['events', '完整事件'], ['calls', '模型调用']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>{error && <div className="inline-error">{error}</div>}{!data && !error && <div className="empty-state"><LoaderCircle className="spin" />正在读取世界记录…</div>}
    {data && tab === 'roles' && <div className="debug-role-layout"><aside className="debug-role-list">{game.people.filter(p => p.id !== 'player').map(p => <button key={p.id} onClick={() => setActor(p.id)} className={actor === p.id ? 'selected' : ''}><PixelPerson color={p.color} id={p.id} size={30} /><div><strong>{p.name}</strong><small>{p.role}</small></div><span className="status-dot" /></button>)}</aside><div className="debug-role-main"><span className="label">私有目标</span><p className="goal-box">{data.world.characters[actor].goal}</p><div className="debug-stat-row"><div><small>实际位置</small><strong>{rooms[data.world.characters[actor].location]}</strong></div><div><small>可见事件</small><strong>{data.memories[actor].length} 条</strong></div><div><small>最近决策</small><strong>{call?.data.duration_ms ?? '—'} ms</strong></div></div><span className="label">最近的行动意图</span><p className="intent-box">{data.proposals.find((p: any) => p.character_id === actor)?.proposal.intent_summary || '角色还没有行动。'}</p><span className="label">这个角色收到的记忆</span><div className="memory-list">{[...data.memories[actor]].reverse().map((e: WorldEvent) => <div key={e.id}><span>#{e.id} · {e.kind === 'intent' ? '个人判断' : e.kind === 'speak' && e.actor_id !== actor ? '他人转述' : '亲历 / 观察'}</span><p>{e.text}</p></div>)}</div>{call && <details className="raw-context"><summary>查看实际发送给角色的上下文</summary><pre>{JSON.stringify(call.data.context, null, 2)}</pre></details>}</div></div>}
    {data && tab === 'events' && <div className="full-events">{[...data.events].reverse().map((e: WorldEvent) => <div key={e.id}><span>#{e.id}</span><span className="event-kind">{e.kind}</span><p>{e.text}</p><small>回合 {e.turn}{e.causes.length > 0 && ` · 引用 ${e.causes.map(id => '#' + id).join(', ')}`}</small></div>)}</div>}
    {data && tab === 'calls' && <><div className="debug-stats"><div><small>已记录调用</small><strong>{data.calls.length}</strong></div><div><small>异常 / 超时</small><strong>{data.calls.filter((c: any) => c.data.status !== 'ok').length}</strong></div><div><small>记录的 Token</small><strong>{data.calls.reduce((sum: number, c: any) => sum + (c.data.usage?.total_tokens || 0), 0).toLocaleString()}</strong></div><div><small>本局模式</small><strong>{game.mode === 'demo' ? '规则演示 · 非 AI' : '模型决策'}</strong></div></div><p className="quiet-note">用量仅统计服务端实际返回的数值；未返回用量的调用不计入。价格由供应商决定。</p><div className="call-list">{data.calls.map((c: any) => <details key={c.id}><summary><span className={`call-status ${c.data.status !== 'ok' ? 'error' : ''}`} />{game.people.find(p => p.id === c.character_id)?.name}<span>{c.data.model}</span><span>{c.data.duration_ms} ms</span><span>{c.data.status}</span></summary>{c.data.error && <p className="inline-error">{c.data.error}</p>}<pre>{JSON.stringify({ context: c.data.context, response: c.data.response, usage: c.data.usage }, null, 2)}</pre></details>)}</div></>}
  </section>;
}

export default function LegacyApp() {
  useEffect(() => { document.title = '松果镇 · 开幕前十五分钟'; }, []);
  const [access, setAccess] = useState({ share_mode: false, debug_enabled: true, sse_enabled: true });
  const [game, setGame] = useState<Game | null>(null), [scenario, setScenario] = useState<Scenario | null>(null);
  const [settings, setSettings] = useState<Settings>(initialSettings), [settingsDraft, setSettingsDraft] = useState({ ...initialSettings, api_key: '' });
  const [modal, setModal] = useState<'new' | 'settings' | 'saves' | 'help' | null>(null), [debug, setDebug] = useState(false);
  const [selected, setSelected] = useState('mayor'), [message, setMessage] = useState(''), [privateTalk, setPrivateTalk] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [mode, setMode] = useState<'demo' | 'ai'>('demo'), [maxTurns, setMaxTurns] = useState(18);
  const [goals, setGoals] = useState<Record<string, string>>({}), [saves, setSaves] = useState<any[]>([]), [feedTab, setFeedTab] = useState('all');
  const [showActions, setShowActions] = useState(false), [endingClosed, setEndingClosed] = useState(''), [agentStatus, setAgentStatus] = useState<any[]>([]);
  const actionLock = useRef(false), feedRef = useRef<HTMLDivElement>(null), gameIdRef = useRef('');
  const closeModal = useCallback(() => setModal(null), []);
  const configured = settings.has_api_key && !!settings.model;

  const latestVersion = useRef({ id: '', version: -1 });
  const adopt = useCallback((next: Game) => {
    if (latestVersion.current.id === next.id && next.version < latestVersion.current.version) return;
    latestVersion.current = { id: next.id, version: next.version };
    gameIdRef.current = next.id; setGame(next); localStorage.setItem('pinecone-game', next.id); setBusy(next.busy);
  }, []);
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const [config, modelSettings, health] = await Promise.all([api<Scenario>('/scenario?scenario_id=festival'), api<Settings>('/settings'), api('/health')]);
        if (disposed) return;
        setScenario(config); setSettings(modelSettings);
        setAccess({ share_mode: !!health.share_mode, debug_enabled: !!health.debug_enabled, sse_enabled: health.sse_enabled !== false });
        setMode(modelSettings.has_api_key && modelSettings.model ? 'ai' : 'demo');
        setGoals(Object.fromEntries(Object.entries(config.characters).map(([a, c]) => [a, c.goal])));
        const savedId = localStorage.getItem('pinecone-game');
        if (savedId) {
          try { const saved = await api<Game>('/games/' + savedId); if (!disposed) adopt(saved); }
          catch { if (!disposed) setModal('new'); }
        } else setModal('new');
      } catch (e: any) { if (!disposed) setError('无法连接小镇服务器。请确认后端已启动。' + e.message); }
      finally { if (!disposed) setLoading(false); }
    }
    void load();
    return () => { disposed = true; };
  }, [adopt]);

  useEffect(() => {
    if (!game?.id) return;
    const id = game.id;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try { const next = await api<Game>('/games/' + id); if (gameIdRef.current === id) adopt(next); }
      catch { /* The reconnecting event stream and fallback polling retry. */ }
      finally { running = false; }
    };
    const stream = access.sse_enabled ? new EventSource(`/api/games/${id}/events?after=${game.cursor}`) : null;
    stream?.addEventListener('world', () => { void refresh(); });
    stream?.addEventListener('turn', e => { const next = JSON.parse((e as MessageEvent).data); setAgentStatus(next.agents); void refresh(); });
    const poll = window.setInterval(refresh, 2500);
    return () => { stream?.close(); clearInterval(poll); };
    // Keep one stream per save. EventSource handles Last-Event-ID on reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, adopt, access.sse_enabled]);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [game?.events.length, feedTab]);
  useEffect(() => { if (!error) return; const timeout = setTimeout(() => setError(''), 7500); return () => clearTimeout(timeout); }, [error]);

  async function createGame() {
    setSaving(true);
    try {
      const next = await api<Game>('/games', { method: 'POST', body: JSON.stringify({ mode, max_turns: maxTurns, goals, scenario_id: 'festival' }) });
      adopt(next); setModal(null); setDebug(false); setSelected('mayor'); setMessage(''); setEndingClosed(''); setShowActions(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }
  async function perform(action: Action) {
    if (!game || busy || actionLock.current || game.status !== 'playing') return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const response = await api<{ game: Game }>(`/games/${game.id}/actions`, { method: 'POST', body: JSON.stringify({ request_id: crypto.randomUUID(), action }) });
      adopt(response.game);
      if (action.action === 'speak') setMessage('');
      setShowActions(false);
    } catch (e: any) {
      setError(e.message);
      try { adopt(await api<Game>(`/games/${game.id}`)); } catch { setBusy(false); }
    } finally { actionLock.current = false; }
  }
  function moveTo(destination: string) {
    if (!game || destination === game.room.id) return;
    const next = game.room.exits.includes(destination) ? destination : 'square';
    void perform({ action: 'move', target_id: next });
  }
  async function openSaves() { try { setSaves(await api('/games')); setModal('saves'); } catch (e: any) { setError(e.message); } }
  async function saveSettings() {
    setSaving(true);
    try { const saved = await api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ base_url: settingsDraft.base_url, model: settingsDraft.model, api_key: settingsDraft.api_key, timeout_seconds: settingsDraft.timeout_seconds }) }); setSettings(saved); setModal(null); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }
  const selectedPerson = game?.people.find(p => p.id === selected);
  const nearby = game?.visible_people.filter(p => p.id !== 'player') || [];
  const canTalk = !!selectedPerson?.visible && selected !== 'player';
  const physicalActions = game?.legal_actions.filter(a => ['interact', 'take', 'give'].includes(a.action)) || [];
  const visibleEvents = game?.events.filter(e => feedTab === 'all' || e.kind === 'speak') || [];
  const fac = game?.known_facilities || {};
  const tasks = [{ icon: KeyRound, name: '打开舞台', done: !!fac.stage_open }, { icon: ShieldCheck, name: '完成安全检查', done: Number(fac.inspection) >= 2 }, { icon: Volume2, name: '让音箱响起来', done: !!fac.speaker_installed }];
  const inventory = game?.items.filter(i => i.holder === 'player') || [];

  return <div className="app-shell">
    <header className="topbar"><a href="#" className="brand" onClick={e => e.preventDefault()}><span className="brand-mark"><Sprout size={24} strokeWidth={1.8} /></span><div><strong>松果镇<span className="brand-pixel">.</span></strong><small>PINECONE TOWN</small></div></a><nav className="main-nav" aria-label="主导航"><button className={!debug ? 'active' : ''} onClick={() => setDebug(false)}><Compass size={16} />漫游小镇</button><button className={debug ? 'active' : ''} onClick={() => { if (game) setDebug(true); }} disabled={!game || !access.debug_enabled}><BookOpen size={16} />世界档案<span className="nav-tag">DEV</span></button></nav><div className="topbar-actions"><button className="icon-button" title="玩法说明" aria-label="玩法说明" onClick={() => setModal('help')}><Info size={18} /></button><button className="settings-button" disabled={access.share_mode} title={access.share_mode ? "私人试玩，模型由本机主人配置" : "模型设置"} onClick={() => { setSettingsDraft({ ...settings, api_key: '' }); setModal('settings'); }}><Settings2 size={16} /><span>模型设置</span><span className={`status-dot ${configured ? '' : 'muted'}`} /></button><span className="user-avatar">旅</span></div></header>
    {error && <div className="toast" role="alert"><Info size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="关闭提示"><X size={16} /></button></div>}
    <main>
      {debug && game ? <DebugPanel game={game} onClose={() => setDebug(false)} /> : <>
        <div className="page-heading"><div><div className="eyebrow"><span className="tiny-line" /> 没有剧本，只有各自的打算</div><h1>开幕前十五分钟<span className="chapter-tag">第一章</span></h1><p>庆典即将开始，而小镇上的每个人，都有自己的心事。</p></div><div className="heading-actions"><button className="secondary-button" onClick={openSaves}><History size={15} />小镇存档</button><button className="primary-button" onClick={() => setModal('new')}><Plus size={16} />新的一天</button></div></div>
        <div className="game-layout"><section className="play-column">
          <div className="map-card"><div className="map-toolbar"><span className="map-toolbar-title"><span className="live-dot" /> 松果镇<span className="toolbar-slash">/</span><span>{game?.room.name || '庆典广场'}</span></span><span className={`mode-badge ${game?.mode === 'ai' ? 'ai' : ''}`}>{game?.mode === 'ai' ? <Sparkles size={12} /> : <Code2 size={12} />}{game?.mode === 'ai' ? 'AI 角色决策' : '规则演示 · 非 AI'}</span><button className="icon-button" aria-label="查看地图说明" onClick={() => setModal('help')}><MoreHorizontal size={17} /></button></div>
            <PixelMap game={game} selected={selected} onSelect={setSelected} onMove={moveTo} busy={busy} />
            <div className="map-bottom-bar"><span><MapPin size={14} /><strong>{game?.room.name || '庆典广场'}</strong><span className="location-description">{game?.room.description || '秋风吹过彩旗，庆典还在准备。'}</span></span><span className="save-indicator"><span className="status-dot" />自动保存</span></div>
          </div>
          <div className="objective-bar"><div className="objective-heading"><span className="objective-flag"><Flag size={16} /></span><div><strong>让庆典顺利开幕</strong><small>检查清单 · 根据你已知的情况</small></div></div><div className="task-list">{tasks.map(({ icon: Icon, name, done }) => <div key={name} className={`task ${done ? 'done' : ''}`}><span className="task-check">{done ? <Check size={11} /> : <Icon size={12} />}</span>{name}</div>)}</div></div>
          <section className="interaction-card"><div className="interaction-header"><div className="interaction-target">{selectedPerson && selected !== 'player' ? <><div className="target-avatar" style={{ background: selectedPerson.color + '25' }}><PixelPerson color={selectedPerson.color} id={selected} size={27} /></div><div><strong>{selectedPerson.name}<span>{selectedPerson.role}</span></strong><small><span className={`status-dot ${canTalk ? '' : 'muted'}`} />{canTalk ? '在你身边，可以交谈' : `上次看见：${rooms[selectedPerson.location || ''] || '未知地点'}`}</small></div></> : <><div className="target-avatar"><PixelPerson color="#f4cb77" id="player" size={27} /></div><div><strong>你想做些什么？</strong><small>选择附近的人交谈，或探索小镇</small></div></>}</div><div className="nearby-avatars">{nearby.map(p => <button key={p.id} className={selected === p.id ? 'active' : ''} onClick={() => setSelected(p.id)} aria-label={`与${p.name}交谈`} title={p.name}><PixelPerson id={p.id} color={p.color} size={22} /></button>)}</div></div>
            {!canTalk && selectedPerson && selected !== 'player' && <div className="remote-notice"><MapPin size={14} /><span>走近一点，才能听见彼此。</span><button disabled={busy || game?.status !== 'playing'} onClick={() => moveTo(selectedPerson.location!)}>前往{rooms[game?.room.exits.includes(selectedPerson.location!) ? selectedPerson.location! : 'square']}<ArrowRight size={13} /></button></div>}
            <form className="composer" onSubmit={e => { e.preventDefault(); if (canTalk && message.trim()) void perform({ action: 'speak', target_id: selected, message, private: privateTalk }); }}><textarea aria-label="对角色说的话" placeholder={busy ? '小镇上的人正在行动，稍等片刻…' : canTalk ? `对${selectedPerson?.name}说点什么，故事从你的话开始…` : '先选择一位在你身边的角色…'} value={message} onChange={e => setMessage(e.target.value)} maxLength={800} disabled={!canTalk || busy || game?.status !== 'playing'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><div className="composer-bottom"><label className={`private-toggle ${privateTalk ? 'checked' : ''}`}><input type="checkbox" checked={privateTalk} onChange={e => setPrivateTalk(e.target.checked)} /><LockKeyhole size={12} />悄悄话</label><span className="composer-hint">{privateTalk ? '只有对方能听见' : '同地点的人也能听见'}</span><span className="enter-hint">Enter 发送</span><button type="submit" className="send-button" disabled={!message.trim() || !canTalk || busy || game?.status !== 'playing'} aria-label="发送对话">{busy ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}</button></div></form>
            <div className="action-strip"><button onClick={() => void perform({ action: 'observe' })} disabled={!game || busy || game.status !== 'playing'}><Eye size={14} />观察周围<span>免费</span></button><button onClick={() => setShowActions(!showActions)} className={showActions ? 'active' : ''} disabled={!game || busy || game.status !== 'playing'}><Package size={14} />采取行动{physicalActions.length > 0 && <span>{physicalActions.length}</span>}<ChevronDown size={12} /></button><button onClick={() => void perform({ action: 'wait' })} disabled={!game || busy || game.status !== 'playing'}><Clock3 size={14} />等一会儿</button><div className="inventory">{inventory.length ? inventory.map(i => <span key={i.id} title="你携带的物品">{i.id === 'key' ? <KeyRound size={13} /> : <Volume2 size={13} />}{i.name}</span>) : <span>背包里空空的</span>}</div></div>
            {showActions && <div className="physical-actions">{physicalActions.length ? physicalActions.map((action, i) => <button key={i} onClick={() => void perform(action)}><span>{action.action === 'interact' ? operationNames[action.interaction!] : action.action === 'give' ? `把${game?.items.find(v => v.id === action.item_id)?.name}交给${game?.people.find(p => p.id === action.target_id)?.name}` : `拿取${game?.items.find(v => v.id === action.item_id)?.name}`}</span><ArrowRight size={14} /></button>) : <p>这里暂时没有可执行的物品或设施交互。试着与角色交谈，或去其他地点。</p>}</div>}
          </section>
        </section>
        <aside className="story-column"><section className="clock-card"><div className="clock-top"><span><Clock3 size={15} />开幕倒计时</span><span className="turn-label">TURN {String(game?.turn || 0).padStart(2, '0')} / {game?.max_turns || 18}</span></div><div className="countdown"><strong>{String(game?.remaining ?? 18).padStart(2, '0')}</strong><div>回合<small>{game?.status === 'won' ? '庆典已顺利开幕' : game?.status === 'lost' ? '开幕时间已经到了' : '每一次行动，让时间向前'}</small></div><span className="clock-art"><Clock3 size={37} strokeWidth={1} /></span></div><div className="turn-segments">{Array.from({ length: game?.max_turns || 18 }, (_, i) => <span key={i} className={i < (game?.remaining ?? 18) ? 'available' : ''} />)}</div><p>阅读与思考不会消耗回合</p></section>
          <section className="story-feed"><div className="feed-header"><h2><Radio size={16} />此刻的小镇</h2><span className="live-label"><span className="live-dot" />LIVE</span></div><div className="feed-tabs"><button className={feedTab === 'all' ? 'active' : ''} onClick={() => setFeedTab('all')}>全部动态</button><button className={feedTab === 'talk' ? 'active' : ''} onClick={() => setFeedTab('talk')}>听到的对话</button><span>{visibleEvents.length}</span></div><div className="event-feed" ref={feedRef} aria-live="polite" aria-label="你看到和听到的事件">{visibleEvents.length ? visibleEvents.map((e, i) => <div key={e.id}>{(i === 0 || visibleEvents[i - 1].turn !== e.turn) && <div className="turn-divider"><span>{e.turn === 0 ? '故事从这里开始' : `第 ${e.turn} 回合`}</span></div>}<EventCard entry={e} people={game!.people} onSelect={setSelected} /></div>) : <div className="feed-empty"><Leaf size={26} strokeWidth={1} /><p>风吹过广场，故事还没开始。</p><small>走进小镇，听听大家的心事。</small></div>}{busy && <div className="thinking-state"><span className="thinking-dots"><i /><i /><i /></span><div><strong>{game?.mode === 'ai' ? '角色们在各自考虑…' : '演示角色正在行动…'}</strong><small>{agentStatus.filter(a => a.status === 'done').length} / 4 已完成</small></div></div>}</div><div className="feed-footer"><Eye size={12} />这里只记录你亲历的事情</div></section>
          <div className="town-note"><Leaf size={15} /><p>你的一句话，或许会让谁<br />改变原本的打算。</p><span>小镇手记 / 01</span></div>
        </aside></div>
        <footer className="page-footer"><span><Sprout size={13} /> 规则决定世界，角色决定故事。</span><button onClick={() => setModal('help')}>第一次来？看看怎么玩 <ArrowUpRightIcon /></button><span>本地存档 · {game?.mode === 'ai' ? '独立 AI 角色' : '规则演示，配置 API 后可开启 AI'}</span></footer>
      </>}
    </main>
    {loading && <div className="loading-overlay"><Sprout size={32} /><LoaderCircle size={20} className="spin" /><span>正在前往松果镇…</span></div>}
    {modal === 'new' && <Modal title="在松果镇，开始新的一天" subtitle="同样的开局，不同的打算。你会把故事带向哪里？" onClose={closeModal} wide><div className="new-game-intro"><span className="intro-illustration"><PixelPerson id="player" color="#f4cb77" size={48} /><Sprout size={25} /></span><div><h3>庆典即将开始，你来得正好。</h3><p>打开舞台、完成检查、找到音箱。办法由你和小镇居民一起决定。</p></div></div><div className="modal-body"><span className="label">选择角色决策方式</span><div className="mode-options"><button className={mode === 'demo' ? 'selected' : ''} onClick={() => setMode('demo')}><Code2 size={20} /><strong>先逛逛小镇<span>无需密钥</span></strong><p>规则演示，角色行为按示例策略执行。<br />用于试玩，不代表 AI 自主决策。</p></button><button className={mode === 'ai' ? 'selected' : ''} disabled={!configured} onClick={() => setMode('ai')}><Sparkles size={20} /><strong>让角色自己决定<span>AI 模式</span></strong><p>{configured ? `使用 ${settings.model}，四位角色独立作出决策。` : '请由本机主人配置模型 API，即可开启四位独立的 AI 角色。'}</p></button></div><div className="turn-choice"><span className="label">留给庆典的时间</span><div>{[12, 18, 24].map(n => <button key={n} className={maxTurns === n ? 'selected' : ''} onClick={() => setMaxTurns(n)}>{n} 回合{n === 18 && <small>推荐</small>}</button>)}</div></div><details className="goal-editor"><summary><Settings2 size={14} />改变角色的初始打算<span>可选</span><ChevronDown size={14} /></summary><p>规则不会改变。AI 模式中，角色会依据新目标作出自己的决定；演示模式只支持有限的示例变化。</p>{Object.entries(scenario?.characters || {}).map(([a, c]) => <label key={a}><span><span style={{ background: c.color }} />{c.name}<small>{c.role}</small></span><textarea value={goals[a] || ''} onChange={e => setGoals({ ...goals, [a]: e.target.value })} maxLength={600} rows={2} /></label>)}</details></div><footer className="modal-footer"><span><History size={13} />旧的小镇会保留在存档中</span><button className="primary-button" onClick={createGame} disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Compass size={16} />}走进小镇<ArrowRight size={15} /></button></footer></Modal>}
    {modal === 'settings' && <Modal title="让小镇有自己的想法" subtitle="连接兼容 Chat Completions 的模型 API。" onClose={closeModal}><form onSubmit={e => { e.preventDefault(); void saveSettings(); }}><div className="modal-body settings-form"><label>API 基础地址<input required type="url" value={settingsDraft.base_url} onChange={e => setSettingsDraft({ ...settingsDraft, base_url: e.target.value })} placeholder="https://your-provider.example/v1" /><small>填写 API 根路径，例如以 /v1 结尾；不要包含 /chat/completions。</small></label><label>模型名称<input required value={settingsDraft.model} onChange={e => setSettingsDraft({ ...settingsDraft, model: e.target.value })} placeholder="填写服务商提供的模型标识" /></label><label>API 密钥<input type="password" autoComplete="new-password" value={settingsDraft.api_key} onChange={e => setSettingsDraft({ ...settingsDraft, api_key: e.target.value })} placeholder={settings.has_api_key ? '已保存，留空沿用当前密钥' : '在此粘贴 API Key'} required={!settings.has_api_key} /><small>只保存到本机后端配置，不返回浏览器，不写入存档或调用记录。</small></label><label>单次决策超时<select value={settingsDraft.timeout_seconds} onChange={e => setSettingsDraft({ ...settingsDraft, timeout_seconds: +e.target.value })}>{[5, 10, 15, 20, 30, 45].map(n => <option key={n} value={n}>{n} 秒</option>)}</select></label><div className="settings-note"><Info size={16} /><p>服务需支持 JSON 对象输出。保存后，新建一局并选择 AI 模式；当前演示局不会自动切换。网络异常时，角色会等待，原因可在世界档案查看。</p></div></div><footer className="modal-footer"><span><LockKeyhole size={13} />本机配置</span><button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存配置</button></footer></form></Modal>}
    {modal === 'saves' && <Modal title="每一天，都有自己的故事" subtitle="存档随行动自动保存，选择一个小镇继续。" onClose={closeModal}><div className="modal-body save-list">{saves.length ? saves.map(s => <button key={s.id} onClick={async () => { try { adopt(await api<Game>('/games/' + s.id)); setModal(null); setDebug(false); } catch (e: any) { setError(e.message); } }}><div className="save-icon"><Sprout size={20} /></div><div><strong>开幕前十五分钟{s.id === game?.id && <span>当前</span>}</strong><small>{new Date(s.created_at).toLocaleString('zh-CN')} · {s.mode === 'ai' ? 'AI 模式' : '规则演示'}</small></div><span>{s.status === 'won' ? '已开幕' : s.status === 'lost' ? '已结束' : `${s.turn}/${s.max_turns} 回合`}</span><ArrowRight size={15} /></button>) : <div className="empty-state">还没有存档。开始新的一天吧。</div>}</div></Modal>}
    {modal === 'help' && <Modal title="小镇漫游指南" subtitle="你不需要猜中标准答案，只需要和这里的人打交道。" onClose={closeModal}><div className="modal-body help-body"><p><MapPin size={18} /><span><strong>先走近，再交谈</strong>点击地点沿小路移动，再选择身边的角色。远处的淡色小人只是上次见到的位置。</span></p><p><MessageCircle size={18} /><span><strong>你说的话，有人在听</strong>普通交谈会被同地点的人听见。“悄悄话”只有对方能收到。对方可能转述，也可能不相信。</span></p><p><Package size={18} /><span><strong>答应了，不等于做完了</strong>说“我把音箱给你”不会真的交付。在“采取行动”里操作物品和设施。角色也遵守同样规则。</span></p><p><Clock3 size={18} /><span><strong>每次行动，时间向前</strong>移动、交谈、交付、交互和等待各用一回合，观察免费。NPC 同时考虑，动作按规则裁决。</span></p><p><Eye size={18} /><span><strong>你看到的，只是你的世界</strong>远处发生的私事不会直接显示。可打开“世界档案”查看完整调试记录，但那会揭示秘密。</span></p><p><Flag size={18} /><span><strong>开幕的三个条件</strong>用钥匙打开舞台、由周师傅完成两回合安全检查、把音箱带到舞台安装。摊位可由镇长在广场确认。</span></p><div className="settings-note"><Code2 size={16} /><p>无密钥时是规则演示。配置模型后新开 AI 局，才能体验角色依据独立目标和信息作出决策。</p></div></div></Modal>}
    {game && game.status !== 'playing' && endingClosed !== game.id && !modal && <Modal title={game.status === 'won' ? '第一首歌，终于响起来了' : '钟声响了，庆典还没准备好'} subtitle={game.status === 'won' ? '每个人的小小行动，一起促成了这一刻。' : '有些承诺还没来得及兑现。下一次，会有什么不同？'} onClose={() => setEndingClosed(game.id)}><div className="modal-body outcome"><span className={`outcome-art ${game.status}`}><Flag size={46} strokeWidth={1.5} /></span><p>{game.events.find(e => e.kind === 'ending')?.text}</p><div className="outcome-stats"><span><strong>{game.turn}</strong>经历的回合</span><span><strong>{game.events.filter(e => e.kind === 'speak').length}</strong>你听到的对话</span><span><strong>{game.mode === 'ai' ? 'AI' : '演示'}</strong>本局决策方式</span></div></div><footer className="modal-footer"><button className="secondary-button" onClick={() => { setEndingClosed(game.id); if (access.debug_enabled) setDebug(true); }}>回看故事</button><button className="primary-button" onClick={() => { setEndingClosed(game.id); setModal('new'); }}>再过一天<ArrowRight size={15} /></button></footer></Modal>}
  </div>;
}

function ArrowUpRightIcon() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 9L9 3M3 3h6v6" stroke="currentColor" strokeWidth="1.2" /></svg>; }
