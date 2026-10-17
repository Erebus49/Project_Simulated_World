import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, Download, Eye, FileText, HeartPulse, MapPin, MessageCircle, Radio, Settings2, Shield, Sparkles, UserRound, X } from 'lucide-react';
import type { ActionOption, ActorId, ActorView, SettingsView, WorldSummary, WorldView } from '../investigation/shared/types.js';
import { INTERACTION_RANGE, type Point } from '../investigation/shared/scene.js';
import { storyTime } from '../investigation/shared/killer.js';
import { InvestigationMap } from './InvestigationMap.js';
import './investigation.css';

interface SessionState { world: WorldView | null; worlds: WorldSummary[]; settings: SettingsView; busy: boolean; warning?: string }
const cast: { id: ActorId; name: string; discipline: string; detail: string; color: string }[] = [
  { id: 'avery', name: '艾弗里', discipline: '记者', detail: '擅长侦查、聆听与查证，习惯先核实消息来源。', color: '#c27e47' },
  { id: 'morgan', name: '摩根', discipline: '医师', detail: '擅长医学、急救和心理观察，优先保护生命。', color: '#5f98a2' },
  { id: 'reed', name: '里德', discipline: '工程师', detail: '熟悉电器、机械与重型设备，随身带着工具。', color: '#877057' },
];
const placeDescription = (world: WorldView, id: string | null) => world.places.find(place => place.id === id)?.name ?? '未知地点';
function Avatar({ actor, small = false }: { actor: ActorView; small?: boolean }) {
  return <span className={`case-avatar ${small ? 'small' : ''}`} style={{ '--avatar-color': actor.color } as React.CSSProperties} aria-hidden="true"><span className="avatar-hair"/><span className="avatar-face"/><span className="avatar-coat"/></span>;
}

function SettingsDialog({ settings, onSave, onClose }: { settings: SettingsView; onSave: (settings: SettingsView) => void; onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl), [model, setModel] = useState(settings.model), [apiKey, setApiKey] = useState(''), [mode, setMode] = useState(settings.mode), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const response = await fetch('/api/investigation/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseUrl, model, apiKey, mode }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '无法保存模型设置。'); onSave(data as SettingsView); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="case-modal-shade" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="case-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header><div><small>本机模型配置</small><h2 id="settings-title">让每个人拥有自己的声音</h2></div><button className="case-icon-button" aria-label="关闭" onClick={onClose}><X size={18}/></button></header><p>模型密钥仅保存在本机服务端。NPC 调用失败时会显示提示，并使用明确标注的离线策略维持这一轮。</p><form onSubmit={event => void save(event)}><label>对话 API 基础地址<input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required/></label><label>模型名称<input value={model} onChange={event => setModel(event.target.value)} placeholder="deepseek-chat" required/></label><label>API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? '已配置，留空保持当前密钥' : '输入服务端密钥'} autoComplete="new-password"/></label><div className="case-mode-choice"><label><input type="radio" checked={mode === 'llm'} onChange={() => setMode('llm')}/>独立 LLM 角色</label><label><input type="radio" checked={mode === 'demo'} onChange={() => setMode('demo')}/>本地离线演示</label></div>{error ? <p className="case-error">{error}</p> : null}<button className="case-primary-button" disabled={busy}>{busy ? '正在保存…' : '保存设置'}</button></form></section></div>;
}

function NewStory({ session, onStart, onContinue, onSettings, busy }: { session: SessionState | null; onStart: (actorId: ActorId, name: string, mode: 'demo' | 'llm') => void; onContinue: (id: string) => void; onSettings: () => void; busy: boolean }) {
  const [selected, setSelected] = useState<ActorId>('avery'), [name, setName] = useState(''), [mode, setMode] = useState<'demo' | 'llm'>(session?.settings.mode === 'llm' ? 'llm' : 'demo');
  const active = session?.world && session.world.status === 'active' ? session.world : null;
  return <main className="case-landing">
    <div className="landing-sky" aria-hidden="true"><i className="star star-one"/><i className="star star-two"/><i className="star star-three"/><div className="landing-horizon"/><div className="landing-glow"/></div>
    <nav className="landing-nav"><span><i/>FIELD RECORD · 1986</span><button onClick={onSettings}><Settings2 size={15}/>模型设置</button></nav>
    <section className="landing-content"><div className="landing-copy"><p className="case-eyebrow"><span/>现代克苏鲁调查 · 多角色 AI 战役</p><h1>来自<br/><em>群星的杀手</em></h1><p className="landing-lede">凌晨三点，堪萨斯州的寂静被一声巨响撕开。广播说一切正常，麦田尽头却亮起了不属于地球的光。</p><div className="landing-meta"><span><Radio size={15}/>戈夫镇隔离区</span><span><Clock3 size={15}/>1986 年 · 凌晨</span><span><UserRound size={15}/>一名真人调查员</span></div><blockquote>“先记录你亲眼看见的事。结论，留到证据足够以后。”<small>— 哈格雷夫博士</small></blockquote></div>
      <section className="investigator-picker" aria-label="创建调查员"><div className="picker-heading"><span>第一步 · 选择你的调查员</span><small>其余角色由 AI 扮演</small></div><div className="investigator-cards">{cast.map(person => <button key={person.id} className={`investigator-choice ${selected === person.id ? 'selected' : ''}`} onClick={() => setSelected(person.id)} style={{ '--avatar-color': person.color } as React.CSSProperties} aria-pressed={selected === person.id}><span className="choice-avatar"><i/><b/></span><strong>{person.name}</strong><small>{person.discipline}</small><p>{person.detail}</p><span className="choice-check"><Check size={13}/></span></button>)}</div><label className="name-field">調查員姓名<input value={name} maxLength={24} onChange={event => setName(event.target.value)} placeholder={cast.find(person => person.id === selected)?.name}/></label><div className="mode-inline"><button className={mode === 'llm' ? 'active' : ''} onClick={() => setMode('llm')} disabled={!session?.settings.hasApiKey}><span className="mode-dot"/>独立 LLM 角色</button><button className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}><span className="mode-dot"/>离线演示</button></div>{mode === 'llm' && !session?.settings.hasApiKey ? <p className="landing-hint">先在模型设置中配置有效的模型和 API Key。</p> : <p className="landing-hint">每位 AI 角色有独立人物卡、技能、秘密、记忆和行动目标。</p>}<button className="begin-investigation" disabled={busy || (mode === 'llm' && !session?.settings.hasApiKey)} onClick={() => onStart(selected, name, mode)}>{busy ? '正在建立调查档案…' : active ? '开始新的调查' : '进入隔离区'}<ArrowUpRight size={18}/></button>
      {active ? <button className="continue-investigation" onClick={() => onContinue(active.id)}>继续「{active.title}」 · 第 {active.round} 次行动 <ChevronRight size={14}/></button> : null}
      {session?.worlds?.length ? <div className="landing-archives"><small>已有调查记录</small>{session.worlds.slice(0, 4).map(record => <button key={record.id} onClick={() => onContinue(record.id)}><span>{record.title}<i>{record.status === 'active' ? `第 ${record.round} 次行动` : record.status === 'saved' ? '已完成' : '已结束'}</i></span><ChevronRight size={13}/></button>)}</div> : null}
      </section>
    </section><footer className="landing-footer"><span>THE KILLER OUT OF SPACE <i>◇</i> COOPERATIVE INVESTIGATION</span><span>本地单人故事 · 每次行动推进一轮</span></footer>
  </main>;
}

function EventLine({ event, world }: { event: WorldView['history'][number]['events'][number]; world: WorldView }) {
  const actor = world.actors.find(item => item.id === event.actorId);
  return <article className={`event-entry ${event.kind === 'dialogue' ? 'dialogue' : ''} ${event.kind === 'world' ? 'world-event' : ''}`}><div className="event-entry-mark">{event.check ? <span>{event.check.die}</span> : event.kind === 'dialogue' ? <MessageCircle size={14}/> : event.kind === 'world' ? <Radio size={14}/> : <span>·</span>}</div><div><small>{actor?.name ?? (event.kind === 'world' ? '世界变化' : '主持人')}<span> · {placeDescription(world, event.locationId)}</span></small><p>{event.text}</p>{event.check ? <div className={`roll-result ${event.check.success ? 'pass' : 'fail'}`}><span>D100 {event.check.die}</span><span>目标 {event.check.dc}%</span><strong>{event.check.level ?? (event.check.success ? '成功' : '失败')}</strong></div> : null}</div></article>;
}

export default function InvestigationApp() {
  const [session, setSession] = useState<SessionState | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false), [tab, setTab] = useState<'story' | 'clues' | 'people'>('story'), [talkingTo, setTalkingTo] = useState<string | null>(null), [draft, setDraft] = useState('');
  const [clock, setClock] = useState(Date.now());
  const world = session?.world ?? null, busy = pending || Boolean(session?.busy);
  const player = world?.actors.find(actor => actor.id === world.playerActorId);
  const latestRound = world?.history.at(-1);
  const time = world ? storyTime(world.elapsedMinutes) : null;
  const routeStatus = useMemo(() => world?.status === 'saved' ? '已控制风险' : world?.status === 'lost' ? '调查受挫' : '调查进行中', [world?.status]);

  const refresh = useCallback(async (id?: string) => {
    const response = await fetch(`/api/investigation/state${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '无法连接调查服务。');
    setSession(data as SessionState);
  }, []);
  useEffect(() => { void refresh().catch(e => setError((e as Error).message)); const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, [refresh]);

  const post = useCallback(async (route: string, body: unknown) => {
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/investigation/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '行动没有完成。');
      setSession(data as SessionState); if (data.warning) setToast(data.warning); return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setPending(false); }
  }, []);

  const start = useCallback(async (actorId: ActorId, name: string, mode: 'demo' | 'llm') => { await post('new', { actorId, name, mode }); }, [post]);
  const walk = useCallback(async (position: Point) => {
    if (!world || busy) return;
    try {
      const response = await fetch('/api/investigation/walk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: world.id, x: position.x, y: position.y }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '移动没有保存。');
      setSession(data as SessionState);
    } catch (e) { setError((e as Error).message); }
  }, [world, busy]);

  const perform = useCallback(async (action: ActionOption['action'], position: Point) => {
    if (!world || busy) return;
    if (action.kind === 'talk') { setTalkingTo(action.target ?? null); setDraft(''); return; }
    await post('action', { id: world.id, action });
  }, [world, busy, post]);
  async function sendQuestion(event: React.FormEvent) {
    event.preventDefault(); if (!world || !talkingTo || !draft.trim()) return;
    const success = await post('action', { id: world.id, action: { kind: 'talk', target: talkingTo, speech: draft.trim() } });
    if (success) { setTalkingTo(null); setDraft(''); }
  }
  const continueStory = useCallback(async (id: string) => {
    try { const response = await fetch('/api/investigation/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '无法恢复这份调查记录。'); setSession(data as SessionState); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);

  if (!session) return <main className="case-loading"><div className="case-loader"/><p>正在核对隔离区的记录…</p>{error ? <div role="alert">{error}<button onClick={() => void refresh().catch(e => setError((e as Error).message))}>重试</button></div> : null}</main>;
  if (!world) return <><NewStory session={session} onStart={(actorId, name, mode) => void start(actorId, name, mode)} onContinue={id => void continueStory(id)} onSettings={() => setSettingsOpen(true)} busy={busy}/>{settingsOpen ? <SettingsDialog settings={session.settings} onClose={() => setSettingsOpen(false)} onSave={settings => { setSession(current => current ? { ...current, settings } : current); setSettingsOpen(false); }}/> : null}{error ? <div className="case-toast" role="alert">{error}<button onClick={() => setError('')}>×</button></div> : null}</>;

  const currentPlayer = player!;
  const currentEvents = latestRound?.events ?? [];
  const allEvents = world.history.slice(1).flatMap(round => round.events);
  const humanMemoryCount = currentPlayer.memories.length;
  const elapsed = `${String(time!.hour).padStart(2, '0')}:${String(time!.minute).padStart(2, '0')}`;

  return <main className="investigation-app">
    <header className="case-topbar"><a className="case-brand" href="#top" aria-label="调查首页"><span className="brand-orbit">✳</span><span>FIELD<br/><b>NOTES</b></span></a><div className="case-title-block"><small>MODERN INVESTIGATION · KANSAS 1986</small><strong>{world.title}</strong></div><div className="case-top-actions"><span className={`connection-chip ${world.agentMode === 'llm' ? 'llm' : ''}`}><i/>{world.agentMode === 'llm' ? 'LLM Agents' : 'Local Agents'}</span><button className="case-icon-button" aria-label="打开操作说明" onClick={() => setToast('在当前箱庭中自由走动。点击地图目标前往，靠近后选择互动；走到场景出口后再确认旅行。每次调查、对话、操作或旅行都会推进一次时间，并触发其余角色行动。')}><CircleHelp size={17}/></button><button className="case-icon-button" aria-label="模型设置" onClick={() => setSettingsOpen(true)}><Settings2 size={17}/></button><a className="case-icon-button" aria-label="导出调查记录" href={`/api/investigation/export?id=${encodeURIComponent(world.id)}`}><Download size={16}/></a></div></header>
    {error ? <div className="case-error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误">×</button></div> : null}
    {session.warning ? <div className="case-warning"><Radio size={14}/>{session.warning}</div> : null}
    <section className="case-dashboard">
      <div className="case-main-column">
        <div className="case-world-summary"><div><div className="case-eyebrow"><span/>来自群星的异常 · 调查记录 {world.id.slice(0, 8).toUpperCase()}</div><h1>{world.status === 'active' ? world.places.find(place => place.id === currentPlayer.locationId)?.name : routeStatus}</h1><p>{world.status === 'active' ? world.currentObjective : world.ending}</p></div><div className="case-clock-card"><div className="clock-time"><Clock3 size={16}/><strong>{elapsed}</strong></div><small>{time!.day === 1 ? '事件日' : `第 ${time!.day} 天`} · {time!.night ? '夜间封锁' : '日间调查'}</small><div className="clock-meter"><i style={{ width: `${Math.min(100, Math.max(0, (world.danger / 12) * 100))}%` }}/></div><span>危机等级 <b>{world.danger}/12</b></span></div></div>
        <div className="case-stats-row"><div><span className="stat-symbol">HP</span><span><small>体力</small><strong>{currentPlayer.hp}<i> / {currentPlayer.maxHp}</i></strong></span><div className="stat-track"><i style={{ width: `${Math.max(0, currentPlayer.hp / currentPlayer.maxHp * 100)}%` }}/></div></div><div><span className="stat-symbol sanity">SAN</span><span><small>理智</small><strong>{currentPlayer.sanity}<i> / {currentPlayer.maxSanity}</i></strong></span><div className="stat-track sanity"><i style={{ width: `${Math.max(0, currentPlayer.sanity / currentPlayer.maxSanity * 100)}%` }}/></div></div><div><span className="stat-symbol round"><Clock3 size={15}/></span><span><small>行动记录</small><strong>{world.round}<i> / {world.maxRounds}</i></strong></span><div className="stat-note">一次互动 · 一次世界推进</div></div></div>
        {world.status === 'active' ? <InvestigationMap world={world} busy={busy} onWalk={walk} onAction={(action) => void perform(action, currentPlayer.position ?? { x: 450, y: 510 })}/> : <section className="case-ending"><div className="ending-sigil">{world.status === 'saved' ? '✓' : '×'}</div><div><small>调查结局 · {world.investigation?.endingKind ?? '记录完成'}</small><h2>{world.status === 'saved' ? '异常已受控' : '这次调查没有阻止扩散'}</h2><p>{world.ending}</p><button className="case-primary-button" onClick={() => { setSession(current => current ? { ...current, world: null } : current); }}>开始新的调查</button></div></section>}
        <section className="case-log-panel"><div className="case-panel-header"><div><small>CASE LOG · {allEvents.length} 条记录</small><h2>行动记录</h2></div><div className="case-tabs" role="tablist"><button aria-selected={tab === 'story'} className={tab === 'story' ? 'selected' : ''} onClick={() => setTab('story')}><FileText size={14}/>叙事</button><button aria-selected={tab === 'clues'} className={tab === 'clues' ? 'selected' : ''} onClick={() => setTab('clues')}><BookOpen size={14}/>线索 {world.clues.length}</button><button aria-selected={tab === 'people'} className={tab === 'people' ? 'selected' : ''} onClick={() => setTab('people')}><UserRound size={14}/>人物</button></div></div>
          {tab === 'story' ? <div className="case-story-feed"><article className="gm-narration"><span className="gm-stamp"><Eye size={14}/>AI 主持人</span><p>{latestRound?.narration || world.history[0]?.narration}</p><small>第 {world.round} 次行动 · {elapsed}</small></article>{[...currentEvents].reverse().map(event => <EventLine key={event.id} event={event} world={world}/>)}</div> : null}
          {tab === 'clues' ? <div className="case-clue-grid">{world.clues.length ? world.clues.map(clue => <article className="case-clue-card" key={clue.id}><span><Sparkles size={14}/>{world.places.find(place => place.id === clue.locationId)?.name}</span><h3>{clue.title}</h3><p>{clue.text}</p></article>) : <div className="case-empty-state"><BookOpen size={24}/><strong>目前还没有记录到线索。</strong><span>在当前场景里走近调查标记，再选择调查行动。</span></div>}</div> : null}
          {tab === 'people' ? <div className="case-cast-list">{world.actors.map(actor => <article key={actor.id} className="case-cast-row"><Avatar actor={actor}/><div><strong>{actor.name}<small>{actor.id === world.playerActorId ? '你 · 真人调查员' : '独立 AI 角色'}</small></strong><p>{actor.subtitle} · {actor.publicGoal}</p></div><span className="cast-location">{actor.locationId ? placeDescription(world, actor.locationId) : '视野之外'}</span></article>)}</div> : null}
        </section>
      </div>
      <aside className="case-side-column"><section className="case-investigator-card"><div className="investigator-card-heading"><span>你正在扮演</span><i>PLAYER</i></div><div className="investigator-card-main"><Avatar actor={currentPlayer}/><div><h2>{currentPlayer.name}</h2><p>{currentPlayer.subtitle}</p></div></div><div className="investigator-card-goal"><small>个人目标</small><p>{currentPlayer.publicGoal}</p>{currentPlayer.privateGoal ? <details><summary>查看个人秘密</summary><p>{currentPlayer.secret}</p><small>{currentPlayer.privateGoal}</small></details> : null}</div><div className="investigator-skills">{Object.entries(currentPlayer.skills ?? {}).sort((a,b) => b[1]-a[1]).slice(0,4).map(([skill, value]) => <span key={skill}><small>{skillName(skill)}</small><b>{value}%</b></span>)}</div></section>
        <section className="case-local-people"><div className="case-side-heading"><span>同场人物</span><small>{world.actors.filter(actor => actor.id !== currentPlayer.id && actor.locationId === currentPlayer.locationId).length} 人</small></div>{world.actors.filter(actor => actor.id !== currentPlayer.id && actor.locationId === currentPlayer.locationId).map(actor => <article className="local-person" key={actor.id}><Avatar actor={actor} small/><div><strong>{actor.name}</strong><small>{actor.subtitle}</small></div><span className="agent-dot" title="AI 角色行动"/></article>)}{world.actors.every(actor => actor.id === currentPlayer.id || actor.locationId !== currentPlayer.locationId) ? <p className="side-empty">目前没有其他人在场。你可以继续调查或前往相邻场景。</p> : null}</section>
        <section className="case-prompt-card"><div className="prompt-icon"><MapPin size={17}/></div><div><small>当前位置</small><strong>{placeDescription(world, currentPlayer.locationId)}</strong><p>场景里的移动不推进时间。调查、交谈、操作、休整或切换场景会结算一轮。</p></div></section>
        <button className="case-new-story-button" onClick={() => setSession(current => current ? { ...current, world: null } : current)}><ArrowDownLeft size={14}/>调查档案</button>
      </aside>
    </section>
    {talkingTo ? <div className="case-modal-shade" role="presentation"><section className="case-modal dialogue-modal" role="dialog" aria-modal="true" aria-labelledby="dialogue-title"><header><div><small>面对面交流 · 会消耗一次行动</small><h2 id="dialogue-title">与 {world.actors.find(actor => actor.id === talkingTo)?.name ?? '调查对象'} 交谈</h2></div><button className="case-icon-button" aria-label="关闭对话" onClick={() => setTalkingTo(null)}><X size={18}/></button></header><p>说清你想核实的事情。对方会基于自己的经历、目标和记忆回应。</p><form onSubmit={event => void sendQuestion(event)}><textarea autoFocus maxLength={400} value={draft} onChange={event => setDraft(event.target.value)} placeholder="你想问什么？" rows={4}/><button className="case-primary-button" disabled={busy || !draft.trim()}>{busy ? '对方正在回应…' : '发起交谈 · 推进时间'}</button></form></section></div> : null}
    {settingsOpen ? <SettingsDialog settings={session.settings} onClose={() => setSettingsOpen(false)} onSave={settings => { setSession(current => current ? { ...current, settings } : current); setSettingsOpen(false); }}/> : null}
    {toast ? <div className="case-toast" role="status"><Check size={15}/>{toast}<button aria-label="关闭消息" onClick={() => setToast('')}>×</button></div> : null}
    {busy ? <div className="case-thinking" role="status"><span className="case-loader small"/>玩家行动已记录 · AI 角色与主持人正在推进本轮…</div> : null}
    <footer className="case-footer"><span>GOVE, KANSAS <i>◇</i> LOCAL CASE FILE / {humanMemoryCount} 条个人记忆</span><span>更新时间 {new Date(clock).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></footer>
  </main>;
}

function skillName(skill: string) {
  const names: Record<string, string> = { spotHidden: '侦查', listen: '聆听', medicine: '医学', library: '图书馆', electrical: '电器维修', mechanical: '机械维修', heavyMachinery: '重型机械', persuade: '说服', psychology: '心理学', stealth: '潜行', science: '物理', firstAid: '急救' };
  return names[skill] ?? skill;
}
