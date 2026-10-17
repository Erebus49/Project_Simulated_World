
import { useEffect, useRef, useState } from 'react';
import type { AgentState, WorldEvent, WorldState } from '../shared/types.js';
import './style.css';

type Event = Omit<WorldEvent, 'differences'>;
interface View { state: WorldState; events: Event[]; mode: 'mock' | 'llm'; configured: boolean; lastError: string; replay: boolean; replayIndex: number; replayLength: number; execution: { outstandingProviderCalls: number; queuedJobs: number; activeBatchId: string | null } }
const roles: Record<string, string> = { owner: '咖啡店主', barista: '店员', customer: '顾客', supplier: '供应商', messenger: '消息传播者' };
const colors = ['#b8956b', '#7c9b8a', '#9ca7bc', '#bb9a9a', '#96a580', '#b5a1bb', '#83a9af', '#c2b57d'];
const actionLabels: Record<string, string> = { move: '移动', work: '工作', wait: '等待', buy: '购买咖啡', set_price: '调整价格', send_message: '发消息' };
const emptyContent = '明天咖啡可能涨价。这个说法还没有核实。';

export default function Dashboard() {
  const [view, setView] = useState<View | null>(null), [connected, setConnected] = useState(false), [error, setError] = useState('');
  const [selected, setSelected] = useState('messenger'), [recipient, setRecipient] = useState('messenger'), [content, setContent] = useState(emptyContent);
  const [enabled, setEnabled] = useState(false), [limit, setLimit] = useState(2), [filter, setFilter] = useState('all');
  const [inspect, setInspect] = useState<Event | null>(null), [observation, setObservation] = useState<unknown>(null);
  const [desiredMode, setDesiredMode] = useState('mock'), [count, setCount] = useState(6), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const file = useRef<HTMLInputElement>(null), timeline = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let socket: WebSocket | null = null, retry: ReturnType<typeof setTimeout>, disposed = false;
    fetch('/api/state').then(r => r.json()).then(setView).catch(() => setError('无法连接运行时，请确认 npm start 已启动。'));
    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      socket.onopen = () => setConnected(true);
      socket.onmessage = event => { const next = JSON.parse(event.data) as View; setView(next); };
      socket.onclose = () => { setConnected(false); if (!disposed) retry = setTimeout(connect, 1500); };
    };
    connect(); return () => { disposed = true; clearTimeout(retry); socket?.close(); };
  }, []);
  useEffect(() => { if (view?.state.rules.speech) { setEnabled(view.state.rules.speech.enabled); setLimit(view.state.rules.speech.dailyLimit || 2); } }, [view?.state.runId]);
  async function control(command: string, extra: Record<string, unknown> = {}) {
    setPending(true); setError('');
    try {
      const response = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, ...extra }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '操作未完成');
      setView(data);
      if (command === 'inject' || command === 'rule') setNotice('已排队，将在下一个控制边界生效。暂停时可点“单步”应用。');
    } catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  async function showObservation() {
    try { const response = await fetch(`/api/observe?id=${selected}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setObservation(data); }
    catch (e) { setError((e as Error).message); }
  }
  const world = view?.state, agents = world ? world.agentOrder.map(id => world.agents[id]!) : [], shop = world?.shops.coffee;
  const current = agents.find(a => a.id === selected) || agents[0];
  const thinking = world?.status === 'deciding', running = world?.status === 'running' || thinking;
  const messages = view?.events.filter(e => e.type === 'rumor_injected' || e.type === 'message_received') || [];
  const infected = new Set(messages.map(e => e.type === 'rumor_injected' ? e.visibility.type === 'recipients' ? e.visibility.recipientIds[0] : '' : String(e.payload.recipientId))).size;
  const failures = view?.events.filter(e => e.type === 'action_rejected') || [];
  const events = (view?.events || []).filter(e => !['tick_advanced', 'batch_started', 'batch_completed', 'action_accepted', 'external_command_received'].includes(e.type)).filter(e => filter === 'all' || e.actorId === filter || e.visibility.type === 'recipients' && e.visibility.recipientIds.includes(filter));
  const name = (id: unknown) => world?.agents[String(id)]?.name || String(id ?? '观察者');
  const eventText = (event: Event): string => {
    const p = event.payload;
    switch (event.type) {
      case 'rumor_injected': return `向${name(event.visibility.type === 'recipients' ? event.visibility.recipientIds[0] : '')}注入传闻：${p.content}`;
      case 'message_sent': return `${name(event.actorId)} → ${name(p.targetId)}：“${p.content}”`;
      case 'message_received': return `${name(p.recipientId)}收到了${name(p.senderId)}的转述：“${p.content}”`;
      case 'purchase_completed': return `${name(event.actorId)}以 ${p.unitPrice} 金币/杯购买了 ${p.quantity} 杯咖啡。`;
      case 'price_changed': return `${name(event.actorId)}将挂牌价格调整为 ${p.unitPrice} 金币。`;
      case 'task_scheduled': return `${name(event.actorId)}开始${actionLabels[String(p.type)] || p.type}，将在 tick ${p.dueTick} 完成。`;
      case 'task_completed': return `${name(event.actorId)}完成${actionLabels[String(p.type)] || p.type}${p.income ? `，获得 ${p.income} 金币` : ''}。`;
      case 'action_rejected': return `${name(event.actorId)}的行动被拒绝：${p.reason}`;
      case 'decision_fallback': return `${name(event.actorId)}暂时等待：${p.reason}`;
      case 'rule_changed': return `发言限制${p.enabled ? `启用：每人每天 ${p.dailyLimit} 次` : '关闭'}，tick ${p.effectiveTick} 生效。`;
      case 'day_started': return `第 ${Number(p.dayIndex) + 1} 天，所有人的发言次数重置。`;
      case 'run_initialized': return '咖啡小镇已初始化。角色拥有不同目标与信息，世界等待你的第一次干预。';
      case 'run_started': return '模拟开始。'; case 'run_paused': return '模拟已请求暂停。'; default: return event.type;
    }
  };
  function person(agent: AgentState, index: number) {
    return <button key={agent.id} className={`resident ${selected === agent.id ? 'selected' : ''}`} onClick={() => setSelected(agent.id)}><span className={`resident-art art-${agent.id}`} style={{ '--resident-color': colors[index] } as React.CSSProperties}><i className="head"/><i className="hair"/><i className="body"/><i className="legs"/></span><strong>{agent.name}</strong><small>{agent.mode === 'thinking' ? '思考中…' : actionLabels[agent.currentAction?.type || ''] || '准备行动'}</small></button>;
  }
  return <div className="runtime-app"><header className="header"><a className="logo" href="/"><span>✳</span><div>松果世界<small>PINECONE WORLD</small></div></a><span className="header-divider"/><span className="project-name">多 Agent 世界运行时 <em>MVP</em></span><span className="connection"><i className={connected ? 'on' : ''}/>{connected ? '已连接本机引擎' : '正在重连…'}</span><a className="export-link" href="/api/export">↓ 导出运行</a></header>
    <main><div className="title-row"><div><span className="eyebrow">SCENARIO 01 / COFFEE TOWN</span><h1>一杯咖啡，许多种打算。<span>咖啡小镇</span></h1><p>投下一条消息，观察它如何被相信、被转述，或被忽略。</p></div><div className="mode-select"><label>决策方式<select value={desiredMode} onChange={e => setDesiredMode(e.target.value)}><option value="mock">Mock · 无需 API</option><option value="llm" disabled={!view?.configured}>AI 模型{view?.configured ? '' : ' · 尚未配置'}</option></select></label><label>角色<select value={count} onChange={e => setCount(+e.target.value)}>{[3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} 人</option>)}</select></label><button className="reset" disabled={pending} onClick={() => { setObservation(null); setInspect(null); void control('reset', { mode: desiredMode, agentCount: count }); }}>↻ 重置世界</button></div></div>
      {(error || view?.lastError) && <div className="error" role="alert">{error || view?.lastError}<button onClick={() => setError('')}>×</button></div>}
      <div className="control-bar"><div className="play-controls"><button className="primary" disabled={!world || pending || view?.replay} onClick={() => void control(running ? 'pause' : 'start')}>{running ? 'Ⅱ 暂停' : '▶ 开始'}</button><button disabled={!world || pending || running || view?.replay} onClick={() => void control('step')}>▹ 单步</button><span className={`simulation-state ${thinking ? 'thinking' : ''}`}><i/>{view?.replay ? '只读回放' : thinking ? '决策批次 · 时钟暂停' : running ? '模拟进行中' : '已暂停'}</span></div><div className="clock"><span>模拟时间</span><strong>{String(world?.tick || 0).padStart(3,'0')}</strong><small>TICK</small><i/>第 {Math.floor((world?.tick || 0) / (world?.config.ticksPerDay || 24)) + 1} 天</div><span className="mode-badge">{view?.mode === 'llm' ? 'AI 决策' : '确定性 Mock'} · {world?.agentOrder.length || 6} 角色</span></div>
      {view?.replay && <div className="replay-bar"><strong>只读回放</strong><input aria-label="回放位置" type="range" min="0" max={view.replayLength} value={view.replayIndex} onChange={e => void control('seek', { index: +e.target.value })}/><span>{view.replayIndex} / {view.replayLength} 事件</span><button onClick={() => void control('reset',{mode:desiredMode,agentCount:count})}>返回新局</button></div>}
      <div className="metric-grid">{[['真实挂牌价',`${shop?.unitPrice ?? 6}`, '金币 / 杯'], ['店铺库存',`${shop?.stock ?? 12}`,'杯可售'], ['已完成交易',`${world?.metrics.transactions || 0}`,'次'], ['收到消息',`${infected}`,'位角色'], ['规则 / 行动拒绝',`${failures.length}`,'次']].map(([label,value,unit]) => <div className="metric" key={label}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
      <div className="main-grid"><div className="left-column"><section className="panel town"><div className="panel-header"><h2>小镇正在发生</h2><span className="muted">全知调试视图 · 角色仅接收局部观察</span></div><div className="town-places">{[['cafe','松果咖啡','☕','挂牌交易 · 工作'],['square','小镇广场','♧','相遇 · 消息往来'],['market','街角集市','▥','供应商的工作地点']].map(([id,label,icon,description]) => <div className={`place place-${id}`} key={id}><div className="place-art"><span>{icon}</span>{id==='cafe' && <><i className="awning"/><i className="window"/><i className="door"/></>}</div><h3>{label}</h3><p>{description}</p><div className="residents">{agents.filter(a=>a.locationId===id).map(a=>person(a,agents.findIndex(b=>b.id===a.id)))}</div></div>)}</div><div className="town-bottom"><span>● 所有结果由规则引擎结算</span><span>点击角色查看状态与消息</span></div></section>
        <section className="panel timeline"><div className="panel-header"><h2>事件时间线 <span className="count">{events.length}</span></h2><select aria-label="筛选角色事件" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部角色</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div className="timeline-list" ref={timeline}>{[...events].reverse().slice(0,100).map(event=><button key={event.eventId} className={`event event-${event.type}`} onClick={()=>setInspect(event)}><span className="event-seq">#{String(event.eventSeq).padStart(3,'0')}</span><span className="event-symbol">{event.type.includes('message')||event.type==='rumor_injected'?'✉':event.type==='purchase_completed'?'☕':event.type==='action_rejected'?'!':'·'}</span><div><span className="event-kind">{event.type==='rumor_injected'?'外部传闻':event.type==='message_received'?'转述 / 角色说法':event.type==='message_sent'?'角色说法':event.type==='action_rejected'?'规则拒绝':'世界事实'}</span><p>{eventText(event)}</p>{event.sourceEventIds.length>0&&<small>↳ 来源 {event.sourceEventIds.map(id=>`#${view?.events.find(e=>e.eventId===id)?.eventSeq??'?'}`).join('、')}</small>}</div><time>T{event.tick}</time></button>)}</div><div className="timeline-bottom">点击事件查看来源链；角色的说法不会自动成为世界事实。</div></section></div>
        <aside><section className="panel intervention"><div className="panel-header"><h2>干预世界</h2><span className="live-tag">CONTROL</span></div><form onSubmit={e=>{e.preventDefault();void control('inject',{recipientId:recipient,content});}}><label>只告诉谁<select value={recipient} onChange={e=>setRecipient(e.target.value)}>{agents.map(a=><option key={a.id} value={a.id}>{a.name} · {roles[a.profile.role]}</option>)}</select></label><label>消息内容<textarea rows={3} maxLength={240} value={content} onChange={e=>setContent(e.target.value)}/></label><p className="hint">标记为传闻。只有接收者先知道，是否传播由角色决定。</p><button className="inject-button" disabled={pending||view?.replay||!content.trim()}>✉ 投递一条传闻</button></form><div className="rule-form"><div><h3>发言上限</h3><label className="switch"><input aria-label="启用发言上限" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span/></label></div><p>限制每个角色每个模拟日成功发送的消息数。</p><div className="rule-input"><input aria-label="每天发言次数" type="number" min="0" max="1000" value={limit} onChange={e=>setLimit(+e.target.value)}/><span>次 / 人 / 天</span><button disabled={pending||view?.replay} onClick={()=>void control('rule',{enabled,dailyLimit:limit})}>应用规则</button></div><small>当前：{world?.rules.speech?.enabled?`每天 ${world.rules.speech.dailyLimit} 次`:'未启用'} · {world?.config.ticksPerDay||24} tick 为一天</small></div>{notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}</section>
          <section className="panel character"><div className="panel-header"><h2>角色档案</h2><span className="debug-tag">私有信息 · 调试</span></div>{current&&<><div className="character-title"><span className="avatar" style={{background:colors[agents.findIndex(a=>a.id===current.id)]}}>{current.name.slice(-1)}</span><div><select aria-label="选择角色" value={current.id} onChange={e=>setSelected(e.target.value)}>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><p>{roles[current.profile.role]} · {world?.locations[current.locationId]?.name}</p></div><span className="char-mode">{current.mode}</span></div><div className="char-numbers"><div><span>资金</span><strong>{current.money}<small>金币</small></strong></div><div><span>咖啡</span><strong>{current.inventory.coffee||0}<small>杯</small></strong></div><div><span>今日发言</span><strong>{current.speechCount}<small>次</small></strong></div></div><div className="char-section"><span>独立目标</span><p>{current.goals.join('；')}</p></div><div className="char-section"><span>当前行动</span><p>{current.currentAction?`${actionLabels[current.currentAction.type]} → tick ${current.currentAction.dueTick} 完成`:'等待下一次决策'}</p></div><div className="char-section"><span>已收消息 <b>{current.inbox.length}</b></span><div className="inbox">{current.inbox.length?current.inbox.slice(-4).reverse().map(message=><button key={message.eventId} onClick={()=>{const event=view?.events.find(e=>e.eventId===message.eventId);if(event)setInspect(event);}}><small>{message.kind==='rumor'?'外部传闻':`来自 ${name(message.senderId)}`} · T{message.receivedTick}</small><p>{message.content}</p></button>):<p className="no-messages">暂未收到消息</p>}</div></div><button className="observe-button" disabled={view?.replay} onClick={()=>void showObservation()}>查看这个角色实际获得的观察 ↗</button></>}</section>
        </aside></div>
      <footer><span>权威状态 + 局部信息 + 可追溯行动</span><span>请求 {world?.metrics.decisionsRequested||0} · 在途 {view?.execution.outstandingProviderCalls||0} · 排队 {view?.execution.queuedJobs||0} · 降级 {world?.metrics.decisionFallbacks||0}<em>Token / 延迟：{view?.mode==='mock'?'Mock 无模型调用':'当前未统计'}</em></span><button onClick={()=>file.current?.click()}>↑ 导入只读回放</button><input hidden ref={file} type="file" accept=".json,application/json" onChange={async e=>{const chosen=e.target.files?.[0];if(!chosen)return;try{await control('import',{archive:JSON.parse(await chosen.text())});}catch{setError('无法读取JSON');}e.target.value='';}}/></footer>
    </main>
    {Boolean(inspect||observation)&&<div className="modal-backdrop" onClick={()=>{setInspect(null);setObservation(null);}}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={inspect?'消息与事件溯源':'角色局部观察'} onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">{inspect?'EVENT PROVENANCE':'AGENT OBSERVATION'}</span><h2>{inspect?'消息从哪里来':'这个角色真正知道什么'}</h2></div><button aria-label="关闭" onClick={()=>{setInspect(null);setObservation(null);}}>×</button></header>{inspect?<><div className="inspect-event"><small>#{inspect.eventSeq} · tick {inspect.tick} · {inspect.type}</small><p>{eventText(inspect)}</p><span>{inspect.visibility.type==='public'?'公开事件':`可见角色：${inspect.visibility.recipientIds.map(name).join('、')||'仅引擎'}`}</span></div><h3>前序来源</h3>{inspect.sourceEventIds.length?inspect.sourceEventIds.map(id=>{const event=view?.events.find(e=>e.eventId===id);return <button className="source-link" key={id} onClick={()=>{if(event)setInspect(event);}}>{event?`#${event.eventSeq} · ${eventText(event)}`:'前序事件尚未显示'} →</button>}):<p className="hint">这是链的起点，没有引用更早的消息。</p>}<details><summary>结构化记录</summary><pre>{JSON.stringify(inspect,null,2)}</pre></details></>:<><p className="hint">这里仅包含本人资源、可见事实和实际收到的消息；不等同于页面的全知档案。</p><pre>{JSON.stringify(observation,null,2)}</pre></>}</section></div>}
  </div>;
}

