import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { actorIds, actionSchema, profilePatchSchema, type ActorId, type Decision, type Settings, type TurnProgress } from '../shared/types';
import { actorById, createWorld, projectWorld, resolveRound, validateAction } from './engine';
import { createProvider, ProviderError, type AgentProvider } from './agents';
import { ConflictError, Store } from './store';
import { parseBackup } from './backup';

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const viewerSchema = z.enum(['director', ...actorIds]);
const turnSchema = z.object({ revision: z.number().int().min(0), humanActorId: z.enum(actorIds).optional(), action: actionSchema.optional() }).refine(v => Boolean(v.humanActorId) === Boolean(v.action), '接管角色后请提交一个行动');
export function createApp(store: Store, options: { providerFactory?: (s: Settings) => AgentProvider; productionDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const busy = new Set<string>();
  const readWorld = (id: string) => {
    const world = store.get(z.string().uuid().parse(id));
    if (!world) throw new HttpError(404, '没有找到这份冒险存档。');
    return world;
  };
  const requireIdle = (id: string) => { if (busy.has(id)) throw new HttpError(409, '这一轮仍在进行，请稍候。'); };
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'fogbound', version: '0.1.0' }));
  app.get('/api/settings', (_req, res) => res.json(store.settingsView()));
  app.put('/api/settings', (req, res) => {
    const body = z.object({ mode: z.enum(['demo', 'llm']), baseUrl: z.string().url().max(500).refine(v => /^https?:\/\//i.test(v)), model: z.string().trim().min(1).max(150), apiKey: z.string().max(1000).optional(), clearApiKey: z.boolean().optional() }).parse(req.body);
    const apiKey = body.clearApiKey ? '' : body.apiKey?.trim() || store.settings().apiKey;
    if (body.mode === 'llm' && !apiKey) throw new HttpError(400, '启用模型模式前，请填写 API Key。');
    store.saveSettings({ mode: body.mode, baseUrl: body.baseUrl.trim(), model: body.model, apiKey });
    res.json(store.settingsView());
  });
  app.get('/api/worlds', (_req, res) => res.json(store.list()));
  app.post('/api/worlds', (req, res) => {
    const viewer = viewerSchema.parse(req.query.viewer ?? 'director');
    const { title } = z.object({ title: z.string().trim().min(1).max(80).default('第七声钟鸣') }).parse(req.body ?? {});
    const world = createWorld(title); store.save(world);
    res.status(201).json(projectWorld(world, viewer));
  });
  app.post('/api/worlds/import', (req, res) => {
    const viewer = viewerSchema.parse(req.query.viewer ?? 'director');
    const world = parseBackup(req.body);
    world.id = randomUUID(); world.revision = 0; world.createdAt = new Date().toISOString(); world.updatedAt = world.createdAt;
    store.save(world); res.status(201).json(projectWorld(world, viewer));
  });
  app.get('/api/worlds/:id', (req, res) => res.json(projectWorld(readWorld(req.params.id), viewerSchema.parse(req.query.viewer ?? 'director'))));
  app.get('/api/worlds/:id/backup', (req, res) => {
    const world = readWorld(req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="fogbound-${world.id}.json"`);
    res.json(world);
  });
  app.get('/api/worlds/:id/export', (req, res) => {
    const world = projectWorld(readWorld(req.params.id), viewerSchema.parse(req.query.viewer ?? 'director'));
    const content = `# ${world.title}\n\n雾港纪事 · ${world.viewer === 'director' ? '导演视角' : `${actorById(readWorld(req.params.id), world.viewer).name}的视角`}\n\n` + world.history.map(r => `## ${r.number === 0 ? '序章' : `第 ${r.number} 轮`}\n\n${r.narration}\n\n` + r.events.filter(e => e.kind !== 'world').map(e => `- ${e.text}${e.check ? ` [d20 ${e.check.die} + ${e.check.modifier} / DC ${e.check.dc}]` : ''}`).join('\n')).join('\n\n');
    res.type('text/markdown').setHeader('Content-Disposition', 'attachment; filename="fogbound-story.md"'); res.send(content);
  });
  app.patch('/api/worlds/:id/actors/:actorId', (req, res) => {
    requireIdle(req.params.id);
    const viewer = viewerSchema.parse(req.query.viewer ?? 'director');
    const body = z.object({ revision: z.number().int(), profile: profilePatchSchema }).parse(req.body);
    const world = readWorld(req.params.id);
    if (world.revision !== body.revision) throw new ConflictError('存档已更新，请刷新后重试。');
    const actor = actorById(world, z.enum(actorIds).parse(req.params.actorId));
    Object.assign(actor, body.profile); world.revision += 1; world.updatedAt = new Date().toISOString(); store.save(world, body.revision);
    res.json(projectWorld(world, viewer));
  });
  app.post('/api/worlds/:id/turn', async (req, res) => {
    const id = req.params.id;
    requireIdle(id);
    const body = turnSchema.parse(req.body);
    const viewer = viewerSchema.parse(req.query.viewer ?? 'director');
    const previous = readWorld(id);
    if (previous.revision !== body.revision) throw new ConflictError('存档已更新，请刷新后重试。');
    if (previous.status !== 'active') throw new HttpError(409, '故事已经结束，可以开始一段新的冒险。');
    if (body.humanActorId && body.action) {
      const error = validateAction(previous, actorById(previous, body.humanActorId), body.action);
      if (error) throw new HttpError(400, error);
    }
    busy.add(id);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: TurnProgress) => { if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
    const heartbeat = setInterval(() => send({ type: 'phase', message: '角色仍在思考，请稍候…' }), 15_000);
    try {
      const provider = (options.providerFactory ?? createProvider)(store.settings());
      send({ type: 'phase', message: '角色正在根据各自的经历与目标做出选择…' });
      const entries = await Promise.all(previous.actors.map(async actor => {
        send({ type: 'agent', actorId: actor.id, status: 'thinking' });
        const decision = actor.id === body.humanActorId ? { action: body.action!, intent: '由真人玩家决定本轮行动。' } : await provider.decide(previous, actor.id);
        send({ type: 'agent', actorId: actor.id, status: 'ready' });
        return [actor.id, decision] as const;
      }));
      send({ type: 'phase', message: '骰点落定。主持人正在编织这一轮的故事…' });
      const world = resolveRound(previous, Object.fromEntries(entries) as Record<ActorId, Decision>);
      world.history.at(-1)!.narration = await provider.narrate(world);
      store.save(world, previous.revision);
      send({ type: 'complete', world: projectWorld(world, viewer) });
    } catch (error) {
      send({ type: 'error', message: error instanceof ProviderError || error instanceof ConflictError ? error.message : '这一轮未能完成，原存档已保留，请重试。' });
      if (!(error instanceof ProviderError)) console.error('Turn failed:', error instanceof Error ? error.message : 'unknown error');
    } finally { clearInterval(heartbeat); busy.delete(id); res.end(); }
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在。')));
  const productionDir = options.productionDir ?? resolve('dist');
  if (existsSync(resolve(productionDir, 'index.html'))) {
    app.use(express.static(productionDir));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(productionDir, 'index.html')));
  }
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof z.ZodError ? 400 : error instanceof ConflictError ? 409 : error instanceof HttpError ? error.status : error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    const message = error instanceof z.ZodError ? `请求内容无效：${error.issues[0]?.message ?? '请检查输入'}` : status === 500 ? '服务暂时无法完成请求。' : status === 413 ? '存档文件过大，最大支持 2MB。' : error.type === 'entity.parse.failed' ? '请求不是有效的 JSON。' : error.message;
    res.status(status).json({ error: message });
  };
  app.use(onError);
  return app;
}
