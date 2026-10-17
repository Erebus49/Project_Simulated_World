import { useEffect, useRef, useState } from 'react';
import type { PlayView } from '../shared/play.js';
import type { DecisionResult } from '../shared/types.js';
import PixelTown from './PixelTown.js';
import { characterPortrait } from './game/villagers.js';
import './pixel.css';
import './soul-town.css';

const locationNames: Record<string, string> = { cafe: '松果咖啡', square: '小镇广场', market: '街角集市' };
function Avatar({ id }: { id: string }) { return <img className="px-avatar" src={characterPortrait(id)} alt="" draggable={false}/>; }
function Item({ frame }: { frame: number }) { return <span className="px-item" style={{ backgroundPosition: `${frame % 12 / 11 * 100}% ${Math.floor(frame / 12) / 10 * 100}%` }}/>; }

export default function PixelRoleplay() {
  const [view, setView] = useState<PlayView | null>(null), [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [near, setNear] = useState('');
  const [dialog, setDialog] = useState(''), [draft, setDraft] = useState(''), [journal, setJournal] = useState(false), [menu, setMenu] = useState(false);
  const [newStory, setNewStory] = useState(false), [name, setName] = useState('归来的旅人'), [goal, setGoal] = useState('弄清阿栗为什么邀请我回来，看看自己能为这家店做些什么。'), [mock, setMock] = useState(false);
  const latest = useRef(view); latest.current = view;
  const lock = useRef(false), bottom = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const busy = pending || !!view?.busy, entry = !view?.started || newStory;
  const character = view?.roster.find(person => person.id === dialog);
  const messages = view?.events.filter(event => event.type === 'message_sent' && event.actorId === 'player' && event.payload.targetId === dialog || event.type === 'message_received' && event.payload.senderId === dialog && event.payload.recipientId === 'player') ?? [];
  const coffee = view?.shops.find(shop => shop.id === 'coffee');
  const liveSocket=useRef<WebSocket|null>(null),panelOpen=entry||!!dialog||journal||menu;
  const panelRef=useRef(panelOpen);panelRef.current=panelOpen;
  useEffect(()=>{if(liveSocket.current?.readyState===WebSocket.OPEN)liveSocket.current.send(JSON.stringify({type:'panel',open:panelOpen}));},[panelOpen]);
  useEffect(() => {
    let closed = false, socket: WebSocket, retry: ReturnType<typeof setTimeout>;
    fetch('/api/play/state').then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!closed) setView(data as PlayView); }).catch(e => { if (!closed) setError((e as Error).message); });
    function connect() {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/play`);
      liveSocket.current=socket;
      socket.onopen = () => {setConnected(true);socket.send(JSON.stringify({type:'panel',open:panelRef.current}));};
      socket.onmessage = event => setView(JSON.parse(event.data) as PlayView);
      socket.onclose = () => { setConnected(false); if (!closed) retry = setTimeout(connect, 1800); };
    }
    connect(); return () => { closed = true; clearTimeout(retry); socket?.close(); };
  }, []);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.code === 'Escape') { setDialog(''); setJournal(false); setMenu(false); (document.activeElement as HTMLElement | null)?.blur(); }
      if (event.code === 'KeyJ' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '') && !entry) { event.preventDefault(); setJournal(value => !value); setDialog(''); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [entry]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, dialog, busy]);
  useEffect(() => { if (dialog) input.current?.focus(); }, [dialog]);
  useEffect(() => { if (!error) return; const timer = setTimeout(() => setError(''), 7500); return () => clearTimeout(timer); }, [error]);

  async function request(path: string, body: unknown) {
    if (path!=='clock'&&(lock.current || latest.current?.busy)) { setError('大家正在行动，请等这次决策结束。'); return false; }
    lock.current = true; setPending(true); setError('');
    try {
      const response = await fetch(`/api/play/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const next = await response.json(); if (!response.ok) throw new Error(next.error ?? '这次行动没有完成。');
      latest.current = next as PlayView; setView(next as PlayView);
      if (next.error) { setError(next.error); return false; } return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { lock.current = false; setPending(false); }
  }
  async function act(action: DecisionResult) { return request('action', { action }); }
  async function start() { if (await request('new', { name, goal, mode: mock ? 'mock' : 'llm' })) { setNewStory(false); setDialog(''); setJournal(false); setMenu(false); setDraft(''); } }
  function openDialog(id: string) { if (!latest.current?.started || entry) return; setDialog(id); setJournal(false); setMenu(false); setDraft(''); }
  function buy() {
    if (view?.player.locationId !== 'cafe') { setError('走到松果咖啡门前，就可以买一杯。'); return; }
    if (coffee) void act({ type: 'buy', params: { shopId: coffee.id, quantity: 1, maxUnitPrice: coffee.unitPrice } });
  }
  function help() {
    if (!view?.player.workLocationIds.includes(view.player.locationId)) { setError('去咖啡店或集市看看有没有需要帮忙的事。'); return; }
    void act({ type: 'work', params: { durationTicks: 2 } });
  }
  function eventText(event: PlayView['events'][number]) {
    const p = event.payload, who = event.actorId === 'player' ? '你' : view?.roster.find(person => person.id === event.actorId)?.name ?? '居民';
    if(event.type==='skill_started')return `${who}到了${p.targetName}旁，开始${p.title}。`;
    if(event.type==='skill_completed')return `${who}完成了${p.title}（${p.targetName}）。`;
    if (event.type === 'purchase_completed') return `${who}买了${p.quantity}杯咖啡，花了${p.total}金币。`;
    if (event.type === 'price_changed') return `咖啡的挂牌价变成了${p.unitPrice}金币。`;
    if (event.type === 'task_completed') return p.type === 'move' ? `你来到了${locationNames[String(p.destinationId)] ?? '新的地方'}。` : p.type === 'work' ? `你帮了一会儿忙，赚了${p.income}金币。` : '你停留片刻，小镇的故事仍在继续。';
    return '这次行动没有完成。';
  }
  return <div className="pixel-game">
    <PixelTown view={view} blocked={entry || !!dialog || journal || menu} onMove={locationId => act({ type: 'move', params: { destinationId: locationId } })} onInteract={openDialog} onNear={setNear}/>
    <div className="px-vignette"/>
    <div className="px-top-left"><div className="px-location"><span className="px-leaf">✦</span><div><strong>{locationNames[view?.player.locationId ?? 'square']}</strong><small>松果镇 · 雨季前的最后一晚</small></div></div><div className="px-quest"><span>✉</span><div><small>一位旧友的邀请</small><p>去松果咖啡，和阿栗聊聊。</p></div><button aria-label="打开日记" onClick={() => setJournal(true)}>J</button></div></div>
    <div className="px-top-right"><div className="px-clock"><span>☀</span><div><strong>雨季前夕</strong><small>{String(17 + Math.floor((30 + (view?.tick ?? 0) * 2) / 60) % 24).padStart(2, '0')}:{String((30 + (view?.tick ?? 0) * 2) % 60).padStart(2, '0')} · 傍晚</small></div><button aria-label="打开菜单" onClick={() => setMenu(value => !value)}>☰</button></div><div className="px-wallet"><Item frame={93}/><strong>{view?.player.money ?? 40}</strong><span>金币</span></div></div>
    {view?.started && !entry && <><div className="px-bottom-left"><Avatar id="player"/><div><strong>{view.player.name}</strong><span>{connected ? view.mode === 'llm' ? '居民由 LLM 驱动' : 'Mock 演示模式' : '正在重连小镇…'}</span></div></div><div className="px-toolbar" aria-label="行动栏"><button onClick={() => setJournal(true)} title="日记 J" aria-label="日记 J"><Item frame={103}/><kbd>J</kbd></button><button disabled={busy} onClick={buy} title="买咖啡" aria-label="买咖啡"><span className="px-coffee-icon"/>{!!view.player.inventory.coffee && <b>{view.player.inventory.coffee}</b>}</button><button disabled={busy} onClick={help} title="帮忙做事" aria-label="帮忙做事"><Item frame={116}/></button><button disabled={busy} onClick={() => void act({ type: 'wait', params: { durationTicks: 2 } })} title="停留片刻" aria-label="停留片刻"><span className="px-wait-icon">◷</span></button><button onClick={() => setMenu(value => !value)} title="菜单" aria-label="菜单"><span className="px-menu-icon">≡</span></button></div><div className="px-controls-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span><span><kbd>E</kbd> 交谈</span><span>点击地面也可以走动</span></div></>}
    {!entry && !dialog && !journal && !menu && <button className={`px-near ${near ? 'visible' : ''}`} disabled={!near} onClick={() => { const person = view?.roster.find(item => item.name === near); if (person) openDialog(person.id); }}><kbd>E</kbd> 与{near || '居民'}交谈</button>}
    {busy && !entry && <div className="px-world-busy"><i/> {dialog ? '对方正在想怎么回答…' : '小镇里的人正在行动，你可以继续走动'}</div>}
    {(error || view?.notice) && <div role="alert" className="px-toast" onClick={() => setError('')}>{error || view?.notice}</div>}
    {!!dialog && !entry && <div className="px-dialog" role="dialog" aria-label={`与${character?.name ?? '居民'}交谈`}><div className="px-portrait-panel"><Avatar id={dialog}/><strong>{character?.name}</strong><small>{character?.bio}</small>{character?.nearby && view?.player.locationId === 'cafe' && <button disabled={busy} onClick={buy}>☕ 买杯咖啡 · {coffee?.unitPrice ?? 6}</button>}</div><div className="px-dialog-main"><div className="px-dialog-title"><span>{character?.nearby ? '就在你面前' : '回想刚才的交谈'}</span><button aria-label="结束交谈" onClick={() => { setDialog(''); (document.activeElement as HTMLElement | null)?.blur(); }}>× <kbd>Esc</kbd></button></div><div className="px-dialog-history" aria-live="polite">{!messages.length && <p className="px-first-words">{dialog === 'owner' ? '你摸了摸口袋里的邀请。阿栗抬起头，认出了你。说点什么吧。' : `你走到${character?.name}身边，停下了脚步。`}</p>}{messages.map(event => <div className={`px-speech ${event.actorId === 'player' ? 'you' : ''}`} key={event.eventId}><small>{event.actorId === 'player' ? '你' : character?.name}</small><p>{String(event.payload.content)}</p></div>)}{busy && <div className="px-typing">···</div>}<div ref={bottom}/></div><form onSubmit={async event => { event.preventDefault(); if (!draft.trim()) return; if (await act({ type: 'send_message', params: { targetId: dialog, content: draft.trim() } })) { setDraft(''); input.current?.focus(); } }}><textarea ref={input} aria-label="你想说的话" rows={1} maxLength={240} value={draft} onChange={event => setDraft(event.target.value)} placeholder={character?.nearby ? '你想说些什么？' : '对方已经走开了，先结束交谈再找找。'} disabled={busy || !character?.nearby} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && draft.trim() && character?.nearby) event.currentTarget.form?.requestSubmit(); } }}/><button disabled={busy || !draft.trim() || !character?.nearby}>{busy ? '…' : '说话 ↵'}</button></form></div></div>}
    {journal && !entry && <div className="px-modal-shade"><section className="px-journal" role="dialog" aria-label="我的日记"><header><div><small>松果镇 · 随身手记</small><h2>旅人的日记</h2></div><button aria-label="合上日记" onClick={() => setJournal(false)}>×</button></header><div className="px-journal-pages"><div><h3>那封邀请</h3><p>{view?.setting.playerHook}</p><h3>我此行的打算</h3><p>{view?.player.goals[0]}</p><h3>熟悉的面孔</h3>{view?.roster.map(person => <button key={person.id} className="px-journal-person" onClick={() => { setJournal(false); openDialog(person.id); }}><Avatar id={person.id}/><div><strong>{person.name}</strong><p>{person.bio}</p><small>{view.events.filter(event => event.type === 'message_received' && event.payload.senderId === person.id).length} 条留给你的话</small></div></button>)}</div><div><h3>我看到和听到的事</h3>{view?.events.filter(event => !event.type.startsWith('message_')).slice().reverse().map(event => <p className="px-journal-event" key={event.eventId}><small>时刻 {event.tick}</small>{eventText(event)}</p>)}{!view?.events.length && <p>还没有新的见闻。出发去小镇走走吧。</p>}</div></div><a href="/api/play/export">保存这本见闻记录 ↓</a></section></div>}
    {menu && !entry && <div className="px-modal-shade"><section className="px-menu" role="dialog" aria-label="游戏菜单"><h2>松果镇</h2><p>雨季前的最后一晚</p><button onClick={() => setMenu(false)}>继续散步</button><button onClick={() => { setMenu(false); setJournal(true); }}>打开日记</button><button onClick={() => void request('clock', {enabled:!view?.autonomous})}>{view?.autonomous?'暂停小镇自动行动':'让小镇继续生活'}</button><button disabled={busy} onClick={() => { setMenu(false); setNewStory(true); }}>重新开始故事</button><a href="/?debug=1">打开世界调试台 ↗</a><small>像素素材：Kenney · CC0</small></section></div>}
    {entry && <div className="px-title-screen"><div className="px-title"><span>PINECONE TOWN</span><h1>松果镇</h1><p>雨季前的最后一晚</p><i>离开两年后，你收到了一封旧友的邀请。</i></div><form className="px-start-panel" onSubmit={event => { event.preventDefault(); void start(); }}><label>你的名字<input aria-label="你的名字" required maxLength={24} value={name} onChange={event => setName(event.target.value)}/></label><details><summary>写下此行的打算</summary><textarea aria-label="此行的打算" rows={2} maxLength={400} value={goal} onChange={event => setGoal(event.target.value)}/></details><button className="px-start" disabled={busy || !mock && !view?.configured}>{pending ? '正在进入小镇…' : '带着邀请，回到小镇'}</button><label className="px-mock"><input type="checkbox" checked={mock} onChange={event => setMock(event.target.checked)}/>Mock 演示 · 不使用真实模型</label><small>{view?.configured ? `居民使用 ${view.model}` : '请在本机 .env.runtime 中配置模型'}</small>{newStory && <button type="button" className="px-cancel-start" onClick={() => setNewStory(false)}>返回当前故事</button>}</form><div className="px-title-controls">WASD / 方向键走动 · 靠近居民按 E 交谈 · J 查看日记</div></div>}
  </div>;
}
