import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { WorldRuntime } from '../engine/runtime.js';
import { MockDecisionProvider } from '../agents/mock.js';
import { LLMDecisionProvider } from '../agents/llm.js';
import { replay } from '../engine/events.js';
import type { RuntimeArchive } from '../shared/types.js';
import { roleplayConfig } from '../scenarios/roleplayTown.js';
import { playerView } from './playerView.js';
import { parseDecision } from '../shared/validation.js';
import { actionSchema } from '../investigation/shared/types.js';
import { createStory, playAction, saveStorySettings, setActiveStory, storySettings, storyState, walkInScene } from '../investigation/server/session.js';

const port = Number(process.env.PORT ?? 8011);
const configured = () => Boolean(process.env.MODEL_API_KEY && process.env.MODEL_BASE_URL && process.env.MODEL_NAME);
let mode: 'mock' | 'llm' = 'llm';
let engine = new WorldRuntime(new LLMDecisionProvider(), roleplayConfig(undefined, undefined, `town-${randomUUID().slice(0, 8)}`));
let lastError = '', stepping = false;
let playStarted = false, playNotice = '';
let living=false,nextLivingStep=0,lastTickWallTime=0;
let replayArchive: RuntimeArchive | null = null, replayIndex = 0;
const ws = new WebSocketServer({ noServer: true });
const playWs = new WebSocketServer({ noServer: true });
const panelClients=new Set<WebSocket>();

function playView() {
  return {...playerView(engine, { mode, started: playStarted, busy: stepping, configured: configured(),
    model: process.env.MODEL_NAME ?? '', error: lastError, notice: playNotice }),autonomous:living};
}

function view() {
  const state = replayArchive ? replay(replayArchive.initialState, replayArchive.events.slice(0, replayIndex)) : engine.snapshot();
  const events = replayArchive ? replayArchive.events.slice(0, replayIndex) : engine.events();
  return { state, events: events.map(({ differences: _differences, ...event }) => event), mode,
    execution: engine.executionStatus(), configured: configured(), lastError, replay: !!replayArchive,
    replayIndex, replayLength: replayArchive?.events.length ?? 0 };
}
function broadcast() {
  const message = JSON.stringify(view());
  for (const client of ws.clients) if (client.readyState === WebSocket.OPEN) client.send(message);
  if (Object.values(engine.snapshot().agents).some(agent => agent.control === 'human')) {
    const playerMessage = JSON.stringify(playView());
    for (const client of playWs.clients) if (client.readyState === WebSocket.OPEN) client.send(playerMessage);
  }
}
function respond(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let length = 0;
  for await (const part of request) { const chunk = Buffer.from(part as Buffer); length += chunk.length; if (length > 8_000_000) throw new Error('文件过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}
async function step() {
  if (stepping || replayArchive) return;
  stepping = true;
  try {
    const before=engine.events().length;
    await paceTick();const operation = engine.snapshot().status === 'paused' ? engine.step() : engine.advance(); broadcast(); await operation;
    if(engine.events().slice(before).some(event=>event.type==='decision_fallback')){
      living=false;playNotice='有角色未能完成模型决策，小镇自动推进已暂停。可查看调试记录；恢复后在菜单里继续。';
    }
  }
  catch (error) { lastError = error instanceof Error ? error.message : '运行异常'; engine.pause(); }
  finally { stepping = false;nextLivingStep=Date.now()+1000; broadcast(); }
}
async function paceTick(){
  const remaining=1100-(Date.now()-lastTickWallTime);
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  lastTickWallTime=Date.now();
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const origin = request.headers.origin;
    if (origin && !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) { respond(response, 403, { error: '仅供本机使用' }); return; }
    if (url.pathname === '/api/investigation/state' && request.method === 'GET') {
      respond(response, 200, storyState(url.searchParams.get('id') ?? undefined)); return;
    }
    if (url.pathname === '/api/investigation/settings' && request.method === 'GET') { respond(response, 200, storySettings()); return; }
    if (url.pathname === '/api/investigation/settings' && request.method === 'PUT') { respond(response, 200, saveStorySettings(await body(request))); return; }
    if (url.pathname === '/api/investigation/new' && request.method === 'POST') { respond(response, 201, createStory(await body(request) as { actorId?: string; name?: string; mode?: string })); return; }
    if (url.pathname === '/api/investigation/select' && request.method === 'POST') {
      const data = await body(request); if (typeof data.id !== 'string') throw new Error('缺少调查存档 ID。');
      respond(response, 200, setActiveStory(data.id)); return;
    }
    if (url.pathname === '/api/investigation/walk' && request.method === 'POST') {
      const data = await body(request);
      if (typeof data.id !== 'string' || typeof data.x !== 'number' || typeof data.y !== 'number') throw new Error('移动坐标无效。');
      respond(response, 200, walkInScene(data.id, { x: data.x, y: data.y })); return;
    }
    if (url.pathname === '/api/investigation/action' && request.method === 'POST') {
      const data = await body(request), parsed = actionSchema.safeParse(data.action);
      if (typeof data.id !== 'string' || !parsed.success) throw new Error('行动内容无效。');
      respond(response, 200, await playAction(data.id, parsed.data)); return;
    }
    if (url.pathname === '/api/investigation/export' && request.method === 'GET') {
      const data = storyState(url.searchParams.get('id') ?? undefined);
      if (!data.world) throw new Error('没有可以导出的调查记录。');
      response.setHeader('Content-Disposition', 'attachment; filename="killer-investigation.json"');
      respond(response, 200, { format: 'killer-investigation-journal-v1', ...data.world }); return;
    }
    if (url.pathname === '/api/play/state' && request.method === 'GET') { respond(response, 200, playView()); return; }
    if(url.pathname==='/api/play/clock'&&request.method==='POST'){
      const data=await body(request);if(typeof data.enabled!=='boolean')throw new Error('enabled must be boolean');
      if(!playStarted||replayArchive)throw new Error('请先进入故事');
      living=data.enabled;nextLivingStep=Date.now()+1000;if(living)playNotice='';
      broadcast();respond(response,200,playView());return;
    }
    if (url.pathname === '/api/play/export' && request.method === 'GET') {
      response.setHeader('Content-Disposition', 'attachment; filename="pinecone-journal.json"');
      const projection = playView();
      respond(response, 200, { format: 'pinecone-player-journal-v1', runId: projection.runId,
        tick: projection.tick, setting: projection.setting, player: projection.player, events: projection.events }); return;
    }
    if (url.pathname === '/api/play/new' && request.method === 'POST') {
      if (stepping) throw new Error('请等当前行动结束后再开始新故事。');
      const data = await body(request);
      if (stepping) throw new Error('请等当前行动结束后再开始新故事。');
      const nextMode = data.mode === 'mock' ? 'mock' : 'llm';
      if (nextMode === 'llm' && !configured()) throw new Error('尚未配置模型，请填写本机 .env.runtime 后重启服务。');
      const config = roleplayConfig(typeof data.name === 'string' ? data.name : undefined,
        typeof data.goal === 'string' ? data.goal : undefined, `town-${randomUUID().slice(0, 8)}`);
      const next = new WorldRuntime(nextMode === 'llm' ? new LLMDecisionProvider() : new MockDecisionProvider(), config);
      engine.cancel(); engine = next; mode = nextMode; replayArchive = null; lastError = ''; playNotice = ''; playStarted = true;living=true;nextLivingStep=Date.now()+1000;lastTickWallTime=0;
      broadcast(); respond(response, 200, playView()); return;
    }
    if (url.pathname === '/api/play/action' && request.method === 'POST') {
      if (!playStarted || replayArchive) throw new Error('请先创建角色，进入故事。');
      if (stepping || engine.snapshot().status !== 'paused') throw new Error('大家正在行动，请稍候。');
      const data = await body(request), action = parseDecision(data.action);
      if (stepping || engine.snapshot().status !== 'paused') throw new Error('大家正在行动，请稍候。');
      const before = engine.events().length;
      const player = engine.snapshot().agents.player;
      if (!player || player.currentAction) throw new Error('请先等待当前行动完成。');
      engine.enqueueCommand({ commandId: randomUUID(), type: 'player_action', action });
      stepping = true; lastError = ''; playNotice = '';
      try {
        // Two ticks resolve a move or a direct exchange; extra ticks only wait for a slow/busy addressee.
        for (let i = 0; i < (action.type === 'send_message' ? 6 : 2); i++) {
          await paceTick();
          const operation = engine.step();
          broadcast(); await operation;
          const recent = engine.events().slice(before);
          const rejection = recent.find(event => event.type === 'action_rejected' && event.actorId === 'player');
          if (rejection) {
            const reasons: Record<string, string> = { recipient_unreachable: '对方已经离开这里，先找到他再交谈。', insufficient_money: '你的金币不够。', insufficient_stock: '咖啡已经售完。', price_exceeds_limit: '店里的挂牌价变了，请重新确认价格。', destination_not_adjacent: '请先经过广场，再去另一处地方。', speech_limit_exceeded: '今天已达到发言上限。' };
            throw new Error(reasons[String(rejection.payload.reason)] ?? '这个行动暂时无法完成。');
          }
          broadcast();
          if(action.type==='send_message'&&recent.some(event=>event.type==='decision_fallback'&&event.actorId===action.params.targetId)){
            living=false;throw new Error('对方的模型调用失败，消息已保留。请恢复模型连接后再交谈，小镇自动推进已暂停。');
          }
          if (i >= 1 && (action.type !== 'send_message' || recent.some(event => event.type === 'message_received' && event.payload.recipientId === 'player' && event.payload.senderId === action.params.targetId))) break;
        }
        if (engine.events().slice(before).some(event => event.type === 'decision_fallback')) playNotice = '部分角色这次没有完成思考，暂时等待。可以稍等片刻或重试交谈。';
        if (engine.snapshot().metrics.decisionsRequested >= engine.snapshot().config.maxDecisionsPerRun) playNotice = '本局已达到模型调用预算，请保存记录后开启新故事。';
      } catch (error) { lastError = error instanceof Error ? error.message : '行动未完成'; }
      finally { stepping = false;nextLivingStep=Date.now()+1000; broadcast(); }
      respond(response, 200, playView()); return;
    }
    if (url.pathname === '/api/state' && request.method === 'GET') { respond(response, 200, view()); return; }
    if (url.pathname === '/api/observe' && request.method === 'GET') {
      if (replayArchive) throw new Error('回放暂只展示记录状态');
      respond(response, 200, engine.observe(url.searchParams.get('id') ?? 'owner')); return;
    }
    if (url.pathname === '/api/export' && request.method === 'GET') {
      response.setHeader('Content-Disposition', 'attachment; filename="coffee-run.json"'); respond(response, 200, replayArchive ?? engine.archive()); return;
    }
    if (url.pathname === '/api/control' && request.method === 'POST') {
      const data = await body(request);
      const command = data.command;
      if (command === 'reset') {
        if (stepping) throw new Error('请先等待当前行动完成');
        const nextMode = data.mode === 'llm' ? 'llm' : 'mock';
        if (nextMode === 'llm' && !configured()) throw new Error('先设置服务端 MODEL_BASE_URL、MODEL_NAME、MODEL_API_KEY');
        const agentCount = Number(data.agentCount ?? 6);
        const next = new WorldRuntime(nextMode === 'llm' ? new LLMDecisionProvider() : new MockDecisionProvider(),
          { runId: `coffee-${randomUUID().slice(0, 8)}`, agentCount, ticksPerDay: 24, maxDecisionsPerRun: 240 });
        engine.cancel(); replayArchive = null; mode = nextMode; engine = next; lastError = '';living=false;
      } else if (command === 'import') {
        if (stepping) throw new Error('请先暂停并等待本批完成');
        const archive = data.archive as RuntimeArchive;
        if (!archive || archive.schemaVersion !== 3 || !Array.isArray(archive.events) || archive.events.length > 5000) throw new Error('不是支持的运行日志');
        const final = replay(archive.initialState, archive.events);
        if (JSON.stringify(final) !== JSON.stringify(archive.finalState)) throw new Error('日志与最终状态不一致');
        engine.pause();living=false; replayArchive = structuredClone(archive); replayIndex = archive.events.length;
      } else if (command === 'seek') {
        if (!replayArchive) throw new Error('请先导入回放');
        replayIndex = Math.max(0, Math.min(replayArchive.events.length, Number(data.index) || 0));
      } else {
        if (replayArchive) throw new Error('当前是只读回放，重置后可开始新局');
        if (command === 'start') engine.start();
        else if (command === 'pause') engine.pause();
        else if (command === 'step') { if (engine.snapshot().status !== 'paused' || stepping) throw new Error('请暂停并等待当前批次结束'); await step(); }
        else if (command === 'inject') engine.enqueueCommand({ commandId: randomUUID(), type: 'inject_message', recipientId: data.recipientId, content: data.content });
        else if (command === 'rule') engine.enqueueCommand({ commandId: randomUUID(), type: 'set_speech_limit', enabled: data.enabled, dailyLimit: data.dailyLimit });
        else throw new Error('不支持的控制命令');
      }
      broadcast(); respond(response, 200, view()); return;
    }
    if (url.pathname.startsWith('/api/')) { respond(response, 404, { error: '接口不存在' }); return; }
    const root = resolve('dist-web');
    const target = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (target !== root && !target.startsWith(root + sep)) { respond(response, 403, { error: '路径无效' }); return; }
    const file = extname(target) ? target : resolve(root, 'index.html');
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain' };
    const content = await readFile(file); response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); response.end(content);
  } catch (error) { respond(response, 400, { error: error instanceof Error ? error.message : '请求失败' }); }
});
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws' && request.url !== '/ws/play') { socket.destroy(); return; }
  const origin = request.headers.origin;
  if (origin && !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) { socket.destroy(); return; }
  const channel = request.url === '/ws/play' ? playWs : ws;
  channel.handleUpgrade(request, socket, head, client => {
    try { client.send(JSON.stringify(channel === playWs ? playView() : view())); } catch { client.close(); }
    channel.emit('connection', client);
    if(channel===playWs){
      client.on('message',raw=>{
        if(raw.toString().length>200)return;
        try{const message=JSON.parse(raw.toString()) as {type?:string;open?:boolean};
          if(message.type==='panel'&&typeof message.open==='boolean'){if(message.open)panelClients.add(client);else panelClients.delete(client);}
        }catch{/* Ignore malformed presence messages. */}
      });
      client.on('close',()=>panelClients.delete(client));
    }
  });
});
const interval = setInterval(() => {
  if (!stepping && !replayArchive && engine.snapshot().status === 'running') void step();
  else if(living&&playStarted&&!stepping&&!replayArchive&&playWs.clients.size>0&&panelClients.size===0&&Date.now()>=nextLivingStep)void step();
}, 750);
server.listen(port, '127.0.0.1', () => console.log(`World roleplay: http://127.0.0.1:${port} (${process.env.MODEL_NAME ?? 'model not configured'})`));
function shutdown() { clearInterval(interval); engine.cancel(); ws.close(); playWs.close(); server.close(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
