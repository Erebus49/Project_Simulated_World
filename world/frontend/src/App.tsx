import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, BookOpen, Check, ChevronDown, Clock3, Code2, Eye, FileText, History, Info, KeyRound, LoaderCircle, LockKeyhole, MessageCircle, Moon, NotebookPen, Plus, Radio, Send, Settings2, Shield, Sparkles, VolumeX, X } from 'lucide-react';
import LegacyApp from './LegacyApp';
const ExplorationMap = lazy(() => import('./ExplorationMap'));
import { PixelPerson } from './PixelMap';
import { api, type Action, type Game, type Point, type Scenario, type Settings } from './types';
import { gap, useExploration } from './useExploration';
import './night.css';
import './soul.css';
import './immersive.css';
import './readable.css';
import WorldIntro from './game/WorldIntro';
import { NightTitle } from './game/NightTitle';

const initialSettings: Settings = { base_url: 'https://api.openai.com/v1', model: '', has_api_key: false, timeout_seconds: 20 };
const operationNames: Record<string, string> = { read_notice: '阅读留镇须知', read_ledger: '翻阅旧账册', open_locker: '尝试打开回收柜', mute_broadcast: '按下静音键', seal_slip: '封存归还联', cut_power: '拉下电闸', play_music: '播放谢幕音乐', answer_voice: '回应广播中的名字', leave_town: '尝试离镇', read_trail: '查看林间路牌', inspect_garden: '辨认庭院旧碑' };
const objectDescriptions: Record<string, string> = { notice: '灰旧的纸张上，最后一条是新贴的红字。你需要自己判断哪些规则可信。', ledger: '账册上的记录并没有按时间排列。旁边的回收柜有三个数字轮。', console: '贴票框、静音键和电闸并排排列。红灯照着一个仍可按下的播放键。', gate: '铁门上刻着一行小字：“交接未毕，不得离镇。”', trail: '东侧树影深处立着一块旧路牌，背面似乎还有刻痕。', garden: '庭院里的石碑被苔藓覆盖，依稀可辨三幅图案。' };

function Dialog({ title, eyebrow = '松果镇 · 夜间档案', onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,summary,a[href]') || []);
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const list = elements(), first = list[0], last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="night-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`night-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}><header><div><span className="night-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button aria-label="关闭" className="night-icon" onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

export default function App() {
  return new URLSearchParams(location.search).has('legacy') ? <LegacyApp /> : <NightGame />;
}

function NightGame() {
  const [game, setGame] = useState<Game | null>(null), [scenario, setScenario] = useState<Scenario | null>(null);
  const [settings, setSettings] = useState<Settings>(initialSettings), [draft, setDraft] = useState({ ...initialSettings, api_key: '' });
  const [access, setAccess] = useState({ share_mode: false, debug_enabled: true, sse_enabled: true });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [modal, setModal] = useState<'new' | 'settings' | 'help' | 'saves' | 'archive' | 'intro' | null>(null);
  const [selected, setSelected] = useState(''), [message, setMessage] = useState(''), [privateTalk, setPrivateTalk] = useState(false), [code, setCode] = useState('');
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [largeText, setLargeText] = useState(() => localStorage.getItem('pinecone-large-text') === '1');
  const [tab, setTab] = useState('journal'), [saves, setSaves] = useState<any[]>([]), [archive, setArchive] = useState<any>(null), [closedEnding, setClosedEnding] = useState('');
  const [mode, setMode] = useState<'demo' | 'ai'>('demo'), [maxTurns, setMaxTurns] = useState(18), [goals, setGoals] = useState<Record<string, string>>({});
  const gameRef = useRef<Game | null>(null), actionLock = useRef(false), textarea = useRef<HTMLTextAreaElement>(null), recordEnd = useRef<HTMLDivElement>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const adopt = useCallback((next: Game) => {
    if (gameRef.current?.id === next.id && next.version < gameRef.current.version) return;
    gameRef.current = next; setGame(next); setBusy(next.busy);
    localStorage.setItem('pinecone-night-game', next.id);
  }, []);
  const persist = useCallback(async (point: Point) => {
    const id = gameRef.current?.id;
    const next = await api<Game>(`/games/${id}/walk`, { method: 'POST', body: JSON.stringify(point) });
    if (gameRef.current?.id === id) adopt(next);
    return next;
  }, [adopt]);
  function select(id: string) {
    setSelected(id); setCode(''); setNotebookOpen(false);
    if (['mayor', 'caretaker', 'shopkeeper', 'reporter'].includes(id)) window.setTimeout(() => textarea.current?.focus(), 40);
  }
  const controls = useExploration(game, !busy && !modal && !notebookOpen && !loading && game?.status === 'playing', persist, select);
  const person = game?.people.find(p => p.id === selected);
  const nearPerson = !!person?.position && gap(controls.position, person.position) <= 31;
  const anchor = game?.mystery?.anchors.find(a => a.id === selected);
  const nearAnchor = !!anchor && gap(controls.position, anchor) <= 27;
  const puzzle = game?.mystery;
  const pendingName = person?.name || '对方';

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [config, model, health] = await Promise.all([api<Scenario>('/scenario'), api<Settings>('/settings'), api('/health')]);
        if (disposed) return;
        setScenario(config); setSettings(model); setMode(model.has_api_key && model.model ? 'ai' : 'demo');
        setAccess({ share_mode: !!health.share_mode, debug_enabled: !!health.debug_enabled, sse_enabled: health.sse_enabled !== false });
        setGoals(Object.fromEntries(Object.entries(config.characters).map(([id, c]) => [id, c.goal])));
        const saved = localStorage.getItem('pinecone-night-game');
        if (saved) {
          try { const next = await api<Game>('/games/' + saved); if (!disposed && next.scenario_id === 'night') adopt(next); else if (!disposed) setModal('new'); }
          catch { if (!disposed) setModal('new'); }
        } else setModal('new');
        if (!localStorage.getItem('pinecone-intro-seen')) setModal('intro');
        else if (!localStorage.getItem('pinecone-guide-done')) setGuideStep(0);
      } catch { if (!disposed) setError('无法连接本机游戏服务。请确认 start.bat 已启动。'); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; };
  }, [adopt]);

  useEffect(() => {
    if (!game?.id) return;
    const id = game.id;
    let refreshInFlight = false, disposed = false;
    const refresh = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try { const next = await api<Game>(`/games/${id}`); if (!disposed && gameRef.current?.id === id) adopt(next); } catch { /* retry on the next event/poll */ }
      finally { refreshInFlight = false; }
    };
    const stream = access.sse_enabled ? new EventSource(`/api/games/${id}/events?after=${game.cursor}`) : null;
    stream?.addEventListener('world', () => { void refresh(); }); stream?.addEventListener('turn', () => { void refresh(); });
    const timer = window.setInterval(() => { if (!actionLock.current) void refresh(); }, 5000);
    return () => { disposed = true; stream?.close(); clearInterval(timer); };
  }, [game?.id, access.sse_enabled, adopt]);
  useEffect(() => { if (tab === 'events' && notebookOpen) recordEnd.current?.scrollIntoView({ block: 'nearest' }); }, [game?.events.length, tab, notebookOpen]);
  useEffect(() => { if (!error) return; const timer = setTimeout(() => setError(''), 6500); return () => clearTimeout(timer); }, [error]);


  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (modal || event.ctrlKey || event.metaKey || event.altKey || document.activeElement?.matches('input,textarea,select,[contenteditable=true]')) return;
      if (event.code === 'KeyJ' && !event.repeat) { event.preventDefault(); controls.clear(); setNotebookOpen(value => !value); }
      if (event.code === 'Escape') { controls.clear(); setNotebookOpen(false); setSelected(''); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [modal, controls.clear]);
  useEffect(() => {
    if (!selected || busy || notebookOpen) return;
    const target = game?.people.find(p => p.id === selected)?.position || game?.mystery?.anchors.find(a => a.id === selected);
    if (target && gap(controls.position, target) > 38) { setSelected(''); textarea.current?.blur(); }
  }, [controls.position, selected, game, busy, notebookOpen]);
  function finishIntro() {
    localStorage.setItem('pinecone-intro-seen', '1');
    if (!localStorage.getItem('pinecone-guide-done')) setGuideStep(0);
    setModal(gameRef.current ? null : 'new');
  }
  function endGuide() { localStorage.setItem('pinecone-guide-done', '1'); setGuideStep(null); }
  useEffect(() => {
    if (!game || guideStep === null) return;
    if (guideStep === 0 && gap(controls.position, { x: 239, y: 211 }) > 12) setGuideStep(1);
    if (guideStep === 1 && game.mystery?.clues.some(clue => clue.id === 'notice')) setGuideStep(2);
  }, [game, controls.position, guideStep]);
  useEffect(() => {
    if (!game || game.status !== 'playing') return;
    const id = game.id;
    let disposed = false, running = false;
    const pulse = async () => {
      if (running || document.hidden || modal || notebookOpen || busy || actionLock.current) return;
      running = true;
      try {
        const talkingTo = ['mayor', 'caretaker', 'shopkeeper', 'reporter'].includes(selected) ? selected : null;
        const next = await api<Game>(`/games/${id}/pulse`, { method: 'POST', body: JSON.stringify({ talking_to: talkingTo }) });
        if (!disposed && gameRef.current?.id === id) adopt(next);
      } catch { /* the next active pulse retries */ }
      finally { running = false; }
    };
    void pulse();
    const timer = window.setInterval(pulse, 800);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [game?.id, game?.status, modal, notebookOpen, selected, busy, adopt]);
  async function perform(action: Action) {
    if (!game || busy || actionLock.current || game.status !== 'playing') return;
    actionLock.current = true; controls.clear(); setError(''); setBusy(true);
    try {
      await controls.flush();
      setBusy(true);
      const response = await api<{ game: Game }>(`/games/${game.id}/actions`, { method: 'POST', body: JSON.stringify({ request_id: crypto.randomUUID(), action }) });
      adopt(response.game);
      if (action.action === 'speak') { setMessage(''); setTab('events'); }
      if (['read_notice', 'read_ledger', 'open_locker', 'read_trail', 'inspect_garden'].includes(action.interaction || '')) { setTab('journal'); setNotebookOpen(true); }
      while (gameRef.current?.id === game.id && gameRef.current.busy) {
        await new Promise(resolve => setTimeout(resolve, access.share_mode ? 400 : 180));
        const current = await api<Game>(`/games/${game.id}`); if (gameRef.current?.id === game.id) adopt(current);
      }
      if (action.action === 'speak' && gameRef.current?.id === game.id && !gameRef.current.events.some(e => e.kind === 'speak' && e.actor_id === action.target_id && e.turn === response.game.turn)) {
        setError(`${pendingName}暂时没有回应。可能是连接超时或回复格式异常，可以稍后再问。`);
      }
    } catch (e: any) {
      setError(e.message);
      try { adopt(await api<Game>(`/games/${game.id}`)); } catch { setBusy(false); }
    } finally { actionLock.current = false; setBusy(!!gameRef.current?.busy); }
  }
  async function createGame() {
    setSaving(true);
    try {
      const next = await api<Game>('/games', { method: 'POST', body: JSON.stringify({ mode, max_turns: maxTurns, goals, scenario_id: 'night' }) });
      adopt(next); setSelected(''); setMessage(''); setCode(''); setModal(null); setClosedEnding(''); setTab('journal'); setNotebookOpen(false);
      if (!localStorage.getItem('pinecone-guide-done')) setGuideStep(0);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }
  async function openSaves() {
    try { setSaves(await api('/games')); setModal('saves'); } catch (e: any) { setError(e.message); }
  }
  async function openArchive() {
    if (!game) return;
    try { setArchive(await api(`/debug/games/${game.id}`)); setModal('archive'); } catch (e: any) { setError(e.message); }
  }
  async function saveSettings() {
    setSaving(true);
    try { const next = await api<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ base_url: draft.base_url, model: draft.model, api_key: draft.api_key, timeout_seconds: draft.timeout_seconds }) }); setSettings(next); setMode('ai'); setModal(null); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }
  const recent = game?.events.filter(e => !['observe', 'wait', 'opening', 'intent'].includes(e.kind)).at(-1);
  const eligible = (anchor?.actions || []).filter(op => !(op === 'open_locker' && puzzle?.locker_open) && !(op === 'mute_broadcast' && puzzle?.muted) && !(op === 'seal_slip' && puzzle?.sealed) && !(op === 'cut_power' && puzzle?.power_off) && !(['play_music', 'answer_voice'].includes(op) && puzzle?.power_off));
  const inventory = game?.items.filter(i => i.holder === 'player') || [];
  const endingVisible = game?.status !== 'playing' && !!game && closedEnding !== game.id && !modal;

  return <div className={`night-app immersive ${largeText ? 'text-large' : ''}`}>
    {error && <div className="night-toast" role="alert"><Info size={15} /><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><X size={14} /></button></div>}
    <main className="immersive-game" aria-label="松果镇游戏画面">
      <Suspense fallback={<div className="phaser-placeholder">正在载入像素世界…</div>}>
      <ExplorationMap game={game} controls={controls} selected={selected} disabled={busy || !!modal || notebookOpen || game?.status !== 'playing'}>
        <div className={`world-hud ${notebookOpen ? 'journal-open' : ''}`}>
          <header className="night-topbar"><a href="/" className="night-brand"><span><Moon size={21} /></span><div>松果镇<small>AFTER THE CURTAIN</small></div></a><div className="night-header-chapter"><span /> 规则怪谈 · 第一夜</div><nav><button onClick={() => void openSaves()} disabled={busy}><History size={15} /><span>存档</span></button>{!access.share_mode && <button onClick={() => { setDraft({ ...settings, api_key: '' }); setModal('settings'); }}><Settings2 size={15} /><span>模型</span></button>}<button aria-label={largeText ? '恢复标准字号' : '加大字号'} aria-pressed={largeText} className="font-toggle" onClick={() => { const next = !largeText; setLargeText(next); localStorage.setItem('pinecone-large-text', next ? '1' : '0'); }}>A<span>+</span></button><button onClick={() => setModal('help')} aria-label="玩法说明"><Info size={17} /></button><button className="new-night-button" onClick={() => setModal('new')} disabled={busy}><Plus size={15} /><span>重入夜色</span></button></nav></header>
          <div className="world-mission"><span className="night-eyebrow">FIRST NIGHT / 留镇须知</span><h1>谢幕后，不要回头</h1><p>{game?.room.name || '庆典广场'}<span>·</span>收集证据，完成交接，找到出口</p></div>
          <div className="world-timer"><div className="night-clock"><span><Clock3 size={12} />距离末班钟</span><strong>{String(game?.remaining ?? 18).padStart(2, '0')}<small>回合</small></strong></div><div className="world-anomalies" aria-label={`已发生 ${puzzle?.anomalies || 0} 次异常`}>{[0, 1, 2].map(i => <i key={i} className={i < (puzzle?.anomalies || 0) ? 'broken' : ''} />)}<span>异常 {puzzle?.anomalies || 0}/3</span></div></div>
          <div className="world-notebook-toggle"><button aria-label="打开夜行手记" aria-expanded={notebookOpen} onClick={() => { controls.clear(); setNotebookOpen(value => !value); }}><NotebookPen size={17} /><span>夜行手记</span><b>{puzzle?.clues.length || 0}</b><kbd>J</kbd></button><button aria-label="查看现场记录" onClick={() => { controls.clear(); setTab('events'); setNotebookOpen(true); }}><MessageCircle size={15} /></button></div>
          {guideStep !== null && !modal && <section className="first-play-guide" aria-label="新手引导"><div><span>初来乍到 · {guideStep + 1}/3</span><button aria-label="结束新手引导" onClick={endGuide}><X size={15} /></button></div><h2>{['先试着走一走', '找到广场公告栏', '线索会替你记住'][guideStep]}</h2><p>{['按 WASD 或方向键移动。草地也能走，树木和房屋需要绕开。', '靠近右边的公告栏，按 E，再选择“阅读留镇须知”。', '按 J 可以打开或收起夜行手记，规则和线索都保存在这里。'][guideStep]}</p>{guideStep === 2 && <button className="guide-finish" onClick={endGuide}>知道了，继续探索 <ArrowRight size={14} /></button>}</section>}
          <div className="world-overview" aria-label="小镇方位图"><span>松果镇 · 夜间地图</span><svg viewBox="0 0 768 480" role="img" aria-label="小镇地图与当前位置"><rect width="768" height="480" fill="#161e28" />{puzzle?.walkable.map(([left, top, right, bottom],i) => <rect key={i} x={left} y={top} width={right-left} height={bottom-top} fill="#65736e" />)}<rect x="32" y="48" width="128" height="80" fill="#937657" /><rect x="320" y="48" width="128" height="96" fill="#656a88" />{puzzle?.anchors.map(a => <circle key={a.id} cx={a.x} cy={a.y} r="7" fill="#b9a776" />)}<circle cx={controls.position.x} cy={controls.position.y} r="10" fill="#8ff2cd" stroke="#151620" strokeWidth="4" /></svg><div><span>西 · 杂货铺</span><span>东 · 林间步道</span></div></div>
          {selected && <div className={`world-dialogue ${person ? 'is-conversation' : 'is-investigation'}`}>
            <div className="night-interaction"><div className="night-interaction-header"><div>{person ? <><span className="night-portrait"><PixelPerson id={person.id} color={person.color} size={26} /></span><div><h2>{person.name}<small>{person.role}</small></h2><p>{nearPerson ? person.activity || '靠近说话。也许你能听出一些破绽。' : '对方离你远了，沿小路靠近后再交谈。'}</p></div></> : anchor ? <><span className="night-portrait object"><FileText size={20} /></span><div><h2>{anchor.name}<small>调查点</small></h2><p>{nearAnchor ? objectDescriptions[anchor.id] : '沿小路靠近这个调查点后，才能操作。'}</p></div></> : <><span className="night-portrait object"><Eye size={20} /></span><div><h2>先找到一条可信的线索</h2><p>草地也能走，靠近公告栏、柜台或居民，按 E 调查与交谈。</p></div></>}</div>{selected && <button className="night-icon" onClick={() => { setSelected(''); textarea.current?.blur(); }} aria-label="结束当前交互"><X size={15} /></button>}</div>
          {person ? <form className="night-composer" onSubmit={e => { e.preventDefault(); if (message.trim() && nearPerson) void perform({ action: 'speak', target_id: person.id, message, private: privateTalk }); }}><textarea ref={textarea} value={message} onChange={e => setMessage(e.target.value)} maxLength={800} disabled={busy || !nearPerson || game?.status !== 'playing'} aria-label="对角色说的话" placeholder={busy ? `${pendingName}正在回答…` : `问问${person.name}，也许对方知道一些事情…`} onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur(); setSelected(''); } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><div><label><input type="checkbox" checked={privateTalk} onChange={e => setPrivateTalk(e.target.checked)} /><LockKeyhole size={11} />悄悄话</label><span>Enter 发送 · Esc 结束输入</span><button type="submit" disabled={!message.trim() || busy || !nearPerson || game?.status !== 'playing'}>{busy ? <LoaderCircle size={15} className="spin" /> : <Send size={14} />}{busy ? '正在回答' : '交谈'}</button></div></form> : anchor ? <div className="investigation-actions">{anchor.id === 'ledger' && !puzzle?.locker_open && <label className="locker-code"><LockKeyhole size={14} /><span>三位柜号</span><input inputMode="numeric" autoComplete="off" pattern="[0-9]{3}" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 3))} maxLength={3} placeholder="· · ·" aria-label="回收柜三位密码" /></label>}{eligible.map(op => <button key={op} className={['play_music', 'answer_voice'].includes(op) ? 'uncertain-action' : ''} disabled={busy || !nearAnchor || game?.status !== 'playing' || (op === 'open_locker' && code.length !== 3)} onClick={() => void perform({ action: 'interact', interaction: op, ...(op === 'open_locker' ? { code } : {}) })}>{op === 'open_locker' ? <KeyRound size={14} /> : op === 'mute_broadcast' ? <VolumeX size={14} /> : <ArrowRight size={14} />}{operationNames[op]}</button>)}</div> : <div className="night-idle-hint"><span><FileText size={16} />广场公告栏</span><ArrowRight size={12} /><span><LockKeyhole size={15} />杂货铺旧账</span><span className="idle-whisper">先收集，再判断。</span></div>}
          <div className={`last-consequence ${recent?.kind === 'anomaly' ? 'anomaly' : ''}`} aria-live="polite">{busy ? <><LoaderCircle size={13} className="spin" /><span>{pendingName}正在低声回答…</span></> : <><AudioLines size={14} /><p>{recent ? recent.kind === 'clue' ? '线索已记入夜行手记，按 J 可随时查看。' : recent.details.message || recent.text : '远处的喇叭滋啦响了一声。不要急着回应。'}</p></>}</div>
        </div>
          </div>}
          {!selected && recent && <div className={`world-feedback ${recent.kind === 'anomaly' ? 'anomaly' : ''}`} role="status"><AudioLines size={14} /><span>{recent.kind === 'clue' ? '新线索已收录，按 J 阅读手记。' : recent.details.message || recent.text}</span></div>}
          <div className="world-bottom"><div className="world-keys"><kbd>WASD</kbd>移动<kbd>E</kbd>交互<kbd>J</kbd>手记<small>走路不扣回合</small></div><div className="world-inventory"><BookOpen size={13} />{inventory.length ? inventory.map(i => i.name).join('、') : '背包暂无物品'}<span className="night-save-dot" />已自动保存</div><div className="world-actions"><button onClick={() => void perform({ action: 'observe' })} disabled={!game || busy || game.status !== 'playing'} aria-label="观察（免费）"><Eye size={13} /></button><button onClick={() => void perform({ action: 'wait' })} disabled={!game || busy || game.status !== 'playing'} aria-label="等待一回合"><Clock3 size={13} /></button>{access.debug_enabled && <button onClick={() => void openArchive()} disabled={!game || busy} aria-label="调试档案"><Code2 size={13} /></button>}</div></div>
          {notebookOpen && <div className="world-journal" aria-label="调查手记面板">
            <aside className="night-notebook" role="region" aria-label="夜行手记"><div className="notebook-cover"><span><NotebookPen size={17} />夜行手记</span><button className="night-icon" aria-label="收起夜行手记" onClick={() => setNotebookOpen(false)}><X size={17} /></button></div><div className="notebook-tabs"><button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}><FileText size={13} />线索 {puzzle?.clues.length || 0}</button><button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}><MessageCircle size={13} />现场记录</button></div><div className="notebook-pages">{tab === 'journal' ? puzzle?.clues.length ? puzzle.clues.map(clue => <article className={`clue-page clue-${clue.id}`} key={clue.id}><span className="clue-source">{clue.source}</span><h3>{clue.title}</h3><p>{clue.text}</p><span className="clue-page-bottom">已收录 · 可反复查看</span></article>) : <div className="empty-notebook"><FileText size={32} strokeWidth={1} /><h3>这里还没有证据</h3><p>先到广场右侧的公告栏，<br />靠近后按 <kbd>E</kbd> 调查。<br /><br />只相信你真正看过的东西。</p><span>01 / 别急着相信第四条</span></div> : <div className="night-event-list">{game?.events.filter(e => !['wait', 'intent'].includes(e.kind)).map(e => <article key={e.id} className={`night-event kind-${e.kind}`}><div><span>{e.actor_id === 'system' ? '镇上的声音' : game.people.find(p => p.id === e.actor_id)?.name || '你'}</span><small>#{String(e.turn).padStart(2, '0')}{e.details.private ? ' · 私语' : ''}</small></div><p>{e.kind === 'clue' ? '你取得了一份线索，完整内容已记入调查手记。' : e.details.message || e.text}</p></article>)}<div ref={recordEnd} /></div>}</div><div className="notebook-bottom"><Eye size={11} />这里只收录你亲历的事情</div><div className="night-whisper"><span>“如果有人说，所有规则都是真的……”</span><p>那就再看一遍纸上的墨迹。</p></div></aside>
          </div>}
        </div>
      </ExplorationMap>
      </Suspense>
    </main>
    {modal === 'intro' && <Dialog title="欢迎来到松果镇" eyebrow="30 秒，认识这个世界" onClose={finishIntro}><WorldIntro onDone={finishIntro} /></Dialog>}
    {loading && <div className="night-loading"><Moon size={35} /><LoaderCircle size={19} className="spin" /><span>正在走进谢幕之后…</span></div>}
    {modal === 'new' && <Dialog title="你还没有离开小镇。" onClose={closeModal} wide><NightTitle /><div className="night-dialog-body"><div className="night-mode-options"><button className={mode === 'ai' ? 'selected' : ''} disabled={!settings.has_api_key || !settings.model} onClick={() => setMode('ai')}><Sparkles size={20} /><strong>独立 AI 对话</strong><p>{settings.has_api_key ? `${settings.model} · 只唤醒交谈对象` : '请先由本机主人配置模型 API'}</p></button><button className={mode === 'demo' ? 'selected' : ''} onClick={() => setMode('demo')}><Code2 size={20} /><strong>先试谜题</strong><p>无需密钥 · 明确的示例台词，非 AI</p></button></div><div className="night-budget"><span>最后一声钟前</span>{[12, 18, 24].map(n => <button key={n} className={maxTurns === n ? 'selected' : ''} onClick={() => setMaxTurns(n)}>{n} 回合</button>)}</div><details className="night-goals"><summary><Settings2 size={13} />修改角色的打算（可选）<ChevronDown size={13} /></summary><p>只影响 AI 的言行。谜题规则、证据与答案不会跟着改变。</p>{Object.entries(scenario?.characters || {}).map(([id, c]) => <label key={id}>{c.name}<small>{c.role}</small><textarea rows={2} value={goals[id] || ''} onChange={e => setGoals({ ...goals, [id]: e.target.value })} maxLength={600} /></label>)}</details></div><footer className="night-dialog-footer"><span><kbd>WASD</kbd> 移动不扣回合 · <kbd>E</kbd> 交互</span><button className="night-primary" onClick={() => void createGame()} disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Moon size={15} />}进入第一夜<ArrowRight size={15} /></button></footer></Dialog>}
    {modal === 'help' && <Dialog title="夜行须知" onClose={closeModal}><div className="night-dialog-body night-help"><div className="world-background"><strong>这个世界发生了什么？</strong><p>你是秋日庆典后留下收尾的志愿者。忙完时，南门已经锁住，广播开始模仿人声。四位居民也滞留在镇上；留镇须知却被人改过。你要核对线索、完成交接，在最后一声钟响前安全离开。</p><button className="night-primary" onClick={() => setModal('intro')}>重新看新手介绍</button></div><p><strong>WASD / 方向键：自由走动</strong>草地和道路都能走，树木、建筑和石井要绕开。走路不消耗回合。手机可使用地图上的方向按钮。</p><p><strong>E：调查或交谈</strong>只有当前目标会显示 E，按下后与提示中的名字交互。多个目标重叠时按 Q 或点“切换目标”，也可直接点人物名字。靠近居民能听见自语，开始交谈时才会让对方停下。点击远处目标不能隔空调查。</p><p><strong>线索要自己读</strong>调查公告栏和旧账册，原文会保留在按 J 打开的夜行手记。密码由证据推导，不需要问 AI 才能通关。</p><p><strong>规则可能被篡改</strong>比较墨迹、署名和有日期的实物记录。错误密码、回应广播或错误交接会累计异常；三次异常或耗尽回合将失败。</p><p><strong>走路与调查不等于聊天</strong>调查、密码和设施操作即时裁决。交谈只调用你正在面对的角色，直接显示完整回复。输入文字时 WASD 不会让你走动。</p><p><strong>先留证据，再做决定</strong>走路、观察、阅读手记不扣时间；调查操作、交谈和等待各用一回合。谜题状态随操作自动保存。</p><p>旧庆典版本仍保留在 <a href="/?legacy=1">旧版入口</a>。</p><p className="asset-credit"><strong>像素素材</strong><a href="https://kenney.nl/assets/tiny-town" target="_blank" rel="noreferrer">Kenney Tiny Town</a> 场景与 <a href="https://kenney.nl/assets/tiny-dungeon" target="_blank" rel="noreferrer">Tiny Dungeon</a> 人物，CC0 许可。地图按 16×16 图块拼接，手机镜头会跟随你。像素画以整数倍显示。</p></div></Dialog>}
    {modal === 'settings' && <Dialog title="模型连接" onClose={closeModal}><form onSubmit={e => { e.preventDefault(); void saveSettings(); }}><div className="night-dialog-body night-settings"><label>API 基础地址<input type="url" required value={draft.base_url} onChange={e => setDraft({ ...draft, base_url: e.target.value })} /></label><label>模型名称<input required value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label><label>API 密钥<input type="password" autoComplete="new-password" required={!settings.has_api_key} value={draft.api_key} onChange={e => setDraft({ ...draft, api_key: e.target.value })} placeholder={settings.has_api_key ? '已保存，留空沿用' : '填写 API Key'} /></label><label>回复超时<select value={draft.timeout_seconds} onChange={e => setDraft({ ...draft, timeout_seconds: +e.target.value })}>{[5, 10, 15, 20, 30, 45].map(n => <option key={n} value={n}>{n} 秒</option>)}</select></label><p>DeepSeek 对话关闭额外思考，限制简短结构化回复。其他兼容模型同样只调用交谈对象。密钥只保存在本机。</p></div><footer className="night-dialog-footer"><span>保存后在 AI 新局中使用</span><button className="night-primary" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存</button></footer></form></Dialog>}
    {modal === 'saves' && <Dialog title="曾经走过的夜路" onClose={closeModal}><div className="night-dialog-body night-save-list">{saves.filter(s => s.scenario_id === 'night').map(s => <button key={s.id} onClick={async () => { try { adopt(await api<Game>(`/games/${s.id}`)); setModal(null); setSelected(''); } catch (e: any) { setError(e.message); } }}><Moon size={22} /><div><strong>谢幕后，不要回头</strong><small>{new Date(s.updated_at).toLocaleString('zh-CN')} · {s.mode === 'ai' ? 'AI 对话' : '规则演示'}</small></div><span>{s.status === 'won' ? '已离镇' : s.status === 'lost' ? '留在夜里' : `${s.turn}/${s.max_turns}`}</span><ArrowRight size={14} /></button>)}{!saves.some(s => s.scenario_id === 'night') && <p>还没有夜间存档。开始第一夜吧。</p>}<a href="/?legacy=1">旧庆典存档保留在旧版入口 <ArrowRight size={12} /></a></div></Dialog>}
    {modal === 'archive' && <Dialog title="世界调试档案" eyebrow="此视角会揭示私有目标与谜题状态" onClose={closeModal} wide><div className="night-dialog-body archive-data"><p>最近模型调用：{archive?.calls.length || 0} 次。这里是调试视角，正常玩家不会收到这些信息。</p>{archive?.calls.map((call: any) => <details key={call.id}><summary>{game?.people.find(p => p.id === call.character_id)?.name} · {call.data.duration_ms} ms · {call.data.status}</summary><pre>{JSON.stringify(call.data, null, 2)}</pre></details>)}<details><summary>完整世界与角色目标</summary><pre>{JSON.stringify(archive?.world, null, 2)}</pre></details></div></Dialog>}
    {endingVisible && game && <Dialog title={game.status === 'won' ? '你没有回头。' : '广播记住了你的声音。'} eyebrow={game.status === 'won' ? '第一夜 / 生还' : '第一夜 / 留镇'} onClose={() => setClosedEnding(game.id)}><div className={`night-ending ${game.status}`}><span>{game.status === 'won' ? <Moon size={43} strokeWidth={1} /> : <Radio size={43} strokeWidth={1} />}</span><p>{game.events.find(e => e.kind === 'ending')?.text}</p><div><span><strong>{game.turn}</strong>次决定</span><span><strong>{puzzle?.clues.length}</strong>份证据</span><span><strong>{puzzle?.anomalies}</strong>次异常</span></div></div><footer className="night-dialog-footer"><button className="night-text-button" onClick={() => setClosedEnding(game.id)}>回看手记</button><button className="night-primary" onClick={() => { setClosedEnding(game.id); setModal('new'); }}>再入夜色<ArrowRight size={15} /></button></footer></Dialog>}
  </div>;
}
