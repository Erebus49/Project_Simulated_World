import { createHash } from 'node:crypto';
import type { ActionIntent, ActionOutcome, AgentObservation, BatchSummary, CoffeeConfig, DecisionJob, DecisionProvider,
  DeepReadonly, DirtyReason, ExternalCommand, RuntimeOptions, WorldEvent, WorldState } from '../shared/types.js';
import { clone, deepFreeze, integer, json, parseCommand, parseDecision } from '../shared/validation.js';
import { coffeeConfig, createCoffeeWorld } from '../scenarios/coffeeTown.js';
import { buildObservation } from '../agents/observation.js';
import { ACTION_REGISTRY, PHASE_ORDER, allowedActions, validateIntent } from './actions.js';
import { EventJournal } from './events.js';

interface ActiveBatch {
  batchId: string;
  generation: number;
  snapshotVersion: number;
  controller: AbortController;
  jobs: DecisionJob[];
}
interface ProviderResult { raw: unknown; fallback: string | null }
const markDirty = (agent: WorldState['agents'][string], reason: DirtyReason) => {
  if (!agent.dirtyReasons.includes(reason)) agent.dirtyReasons.push(reason);
};

export class WorldRuntime {
  #journal: EventJournal;
  #config: CoffeeConfig;
  #provider: DecisionProvider;
  #options: Required<RuntimeOptions>;
  #generation = 0;
  #batchCounter = 0;
  #active: ActiveBatch | null = null;
  #operation: Promise<BatchSummary> | null = null;
  #continueRunning = false;
  #commands: ExternalCommand[] = [];
  #commandIds = new Set<string>();
  #lastJobs: DecisionJob[] = [];
  // A provider that ignores AbortSignal keeps occupying a real slot until its
  // promise settles. Timeout fallback must not quietly create more requests.
  #providerOutstanding = 0;

  constructor(provider: DecisionProvider, config: Partial<CoffeeConfig> & { agentCount?: number } = {}, options: RuntimeOptions = {}) {
    this.#provider = provider; this.#config = coffeeConfig(config);
    this.#options = {
      maxConcurrency: integer(options.maxConcurrency ?? 3, 'maxConcurrency', 1, 8),
      requestTimeoutMs: integer(options.requestTimeoutMs ?? 15_000, 'requestTimeoutMs', 1, 300_000),
      batchTimeoutMs: integer(options.batchTimeoutMs ?? 30_000, 'batchTimeoutMs', 1, 600_000),
    };
    this.#journal = new EventJournal(createCoffeeWorld(this.#config));
    this.#initialize();
  }
  #initialize() {
    this.#journal.commit({ type: 'run_initialized', payload: { schemaVersion: 3, seed: this.#config.seed, agentCount: this.#config.agents.length,
      phaseOrder: [...PHASE_ORDER], moneyUnit: 'integer credit', priceVisibility: 'public posters; inventory local' } });
  }
  snapshot(): DeepReadonly<WorldState> { return this.#journal.snapshot(); }
  events(): DeepReadonly<WorldEvent[]> { return this.#journal.events(); }
  archive() { return this.#journal.archive(); }
  jobs(): DeepReadonly<DecisionJob[]> { return deepFreeze(clone(this.#active?.jobs ?? this.#lastJobs)); }
  executionStatus() {
    return { outstandingProviderCalls: this.#providerOutstanding,
      queuedJobs: this.#active?.jobs.filter(job => job.status === 'queued').length ?? 0,
      activeBatchId: this.#active?.batchId ?? null };
  }
  observe(agentId: string): DeepReadonly<AgentObservation> {
    return buildObservation(this.snapshot(), this.events(), agentId, this.#active?.batchId ?? 'inspection');
  }

  start(): void {
    if (this.snapshot().status === 'cancelled') throw new Error('Reset a cancelled run before starting');
    this.#continueRunning = true;
    if (this.snapshot().status === 'paused') this.#journal.commit({ type: 'run_started' }, state => { state.status = 'running'; });
  }
  pause(): void {
    if (this.snapshot().status === 'cancelled') return;
    this.#continueRunning = false;
    if (this.snapshot().status === 'paused') return;
    this.#journal.commit({ type: 'run_paused', payload: { atBatchBoundary: !this.#active } }, state => {
      if (!this.#active) state.status = 'paused';
    });
  }
  cancel(): void {
    if (this.snapshot().status === 'cancelled') return;
    this.#continueRunning = false;
    this.#active?.controller.abort('run_cancelled');
    this.#journal.commit({ type: 'run_cancelled' }, state => {
      state.status = 'cancelled';
      for (const agent of Object.values(state.agents)) if (agent.mode === 'thinking') agent.mode = 'idle';
    });
  }
  reset(overrides: Partial<CoffeeConfig> & { agentCount?: number } = {}): void {
    this.#active?.controller.abort('run_reset');
    this.#generation++;
    this.#continueRunning = false; this.#commands = []; this.#commandIds.clear();
    this.#active = null; this.#operation = null; this.#lastJobs = []; this.#batchCounter = 0;
    const base = clone(this.#config);
    const agentOverrides = overrides.agentCount !== undefined && !overrides.agents ?
      { agents: coffeeConfig({ agentCount: overrides.agentCount }).agents } : {};
    const config = coffeeConfig({ ...base, ...agentOverrides, ...overrides,
      runId: overrides.runId ?? `${this.#config.runId}:reset${this.#generation}` });
    this.#config = config; this.#journal = new EventJournal(createCoffeeWorld(config)); this.#initialize();
  }
  /** Transport staging only. Applied/logged at the next tick's control boundary. */
  enqueueCommand(input: unknown): boolean {
    if (this.snapshot().status === 'cancelled') throw new Error('Run is cancelled');
    const command = parseCommand(input);
    if (this.#commandIds.has(command.commandId)) return false;
    this.#commandIds.add(command.commandId); this.#commands.push(command); return true;
  }
  /** A paused clock never advances through advance(). */
  async advance(): Promise<BatchSummary> {
    if (this.#operation) throw new Error('A decision batch is already in flight');
    if (this.snapshot().status !== 'running') return this.#empty();
    return this.#beginOperation();
  }
  /** Exactly one tick + its decision barrier, then paused. No real-time timer in P0. */
  async step(): Promise<BatchSummary> {
    if (this.#operation) throw new Error('A decision batch is already in flight');
    if (this.snapshot().status !== 'paused') throw new Error('Single-step requires a paused run');
    this.#continueRunning = false;
    return this.#beginOperation();
  }
  #empty(): BatchSummary { return { batchId: null, tick: this.snapshot().tick, selectedAgentIds: [], outcomes: [], cancelled: false }; }
  async #beginOperation(): Promise<BatchSummary> {
    const generation = this.#generation;
    // Store the guard before allowing a provider to re-enter the engine.
    const operation = Promise.resolve().then(() => this.#tick(generation));
    this.#operation = operation;
    try { return await operation; }
    finally { if (generation === this.#generation && this.#operation === operation) this.#operation = null; }
  }

  #controlBoundary() {
    const commands = this.#commands.splice(0);
    for (const command of commands) {
      this.#journal.commit({ type: 'external_command_received', visibility: { type: 'recipients', recipientIds: [] }, payload: { command: json(command) } }, state => {
        state.pendingExternalCommands.push(clone(command));
      });
    }
    for (const command of this.snapshot().pendingExternalCommands) {
      if (command.type === 'player_action') {
        this.#applyHumanAction(command.commandId, parseDecision(command.action));
        continue;
      }
      if (command.type === 'set_speech_limit') {
        this.#journal.commit({ type: 'rule_changed', payload: { commandId: command.commandId,
          enabled: command.enabled, dailyLimit: command.dailyLimit, effectiveTick: this.snapshot().tick + 1 } }, state => {
          state.rules.speech = { id: 'speech', type: 'speech_limit', enabled: command.enabled,
            dailyLimit: command.dailyLimit, effectiveTick: state.tick + 1 };
          for (const agent of Object.values(state.agents)) markDirty(agent, 'rule_changed');
          state.pendingExternalCommands = state.pendingExternalCommands.filter(c => c.commandId !== command.commandId);
        });
        continue;
      }
      const current = this.snapshot();
      const recipient = Object.hasOwn(current.agents, command.recipientId) ? current.agents[command.recipientId] : undefined;
      if (!recipient) {
        this.#journal.commit({ type: 'command_rejected', visibility: { type: 'recipients', recipientIds: [] },
          payload: { commandId: command.commandId, reason: 'recipient_not_found' } }, state => {
          state.pendingExternalCommands = state.pendingExternalCommands.filter(c => c.commandId !== command.commandId);
        });
        continue;
      }
      this.#journal.commit({ type: 'rumor_injected', visibility: { type: 'recipients', recipientIds: [recipient.id] },
        payload: { commandId: command.commandId, content: command.content, kind: 'rumor' } }, (state, eventId) => {
        const agent = state.agents[recipient.id]!;
        agent.inbox.push({ eventId, senderId: null, content: command.content, kind: 'rumor', receivedTick: state.tick, sourceEventIds: [] });
        agent.beliefs.push({ eventId, kind: 'reported_claim', content: command.content, sourceActorId: null });
        markDirty(agent, 'message_received');
        state.pendingExternalCommands = state.pendingExternalCommands.filter(c => c.commandId !== command.commandId);
      });
    }
  }

  #advanceClock() {
    const old = this.snapshot(), nextTick = old.tick + 1;
    const due = old.scheduledTasks.filter(task => task.dueTick <= nextTick);
    const arriving=Object.values(old.agents).filter(agent=>agent.activity?.stage==='approaching'&&agent.activity.actAtTick<=nextTick);
    const newDay = Math.floor(nextTick / old.config.ticksPerDay);
    this.#journal.commit({ type: 'tick_advanced', visibility: { type: 'recipients', recipientIds: [] },
      payload: { from: old.tick, to: nextTick, completedTaskIds: due.map(task => task.taskId) } }, state => {
      state.tick = nextTick;
      for(const incoming of arriving){const agent=state.agents[incoming.id]!;agent.position={...agent.activity!.to};agent.activity!.stage='acting';}
      for (const task of due) {
        const agent = state.agents[task.actorId]!;
        if (task.destinationId) {
          agent.locationId = task.destinationId;
          if(agent.position){const defaults:Record<string,{x:number;y:number}>={cafe:{x:266,y:304},square:{x:410,y:400},market:{x:550,y:384}};agent.position={...defaults[task.destinationId]!};}
        }
        if(task.type==='use_skill'){
          const target=state.sceneObjects![task.targetId!]!,skill=state.config.skillDefinitions!.find(definition=>definition.id===task.skillId)!;
          if(skill.effect.stat)target.state[skill.effect.stat]=Math.min(skill.effect.maximum??Number.MAX_SAFE_INTEGER,(target.state[skill.effect.stat]??0)+(skill.effect.amount??1));
          if(skill.effect.item)agent.inventory[skill.effect.item]=(agent.inventory[skill.effect.item]??0)+1;
          target.reservedBy=null;agent.skillHistory??={};agent.skillHistory[`${skill.id}:${target.id}`]=nextTick;agent.activity=null;
        }
        agent.money += task.income; state.metrics.workIncomeCreated += task.income;
        agent.currentAction = null; agent.mode = 'idle'; markDirty(agent, 'action_completed');
      }
      state.scheduledTasks = state.scheduledTasks.filter(task => task.dueTick > nextTick);
      for (const agent of Object.values(state.agents)) if (agent.dayIndex !== newDay) { agent.dayIndex = newDay; agent.speechCount = 0; }
    });
    for(const agent of arriving){
      this.#journal.commit({type:'skill_started',actorId:agent.id,visibility:{type:'recipients',recipientIds:old.agentOrder.filter(id=>old.agents[id]!.locationId===agent.locationId)},payload:{intentId:agent.activity!.intentId,skillId:agent.activity!.skillId,targetId:agent.activity!.targetId,targetName:old.sceneObjects![agent.activity!.targetId]!.name,title:agent.activity!.title}});
    }
    if (Math.floor(old.tick / old.config.ticksPerDay) !== newDay) {
      this.#journal.commit({ type: 'day_started', payload: { dayIndex: newDay, resetSpeechCounts: true } });
    }
    for (const task of due) {
      if(task.type==='use_skill'){
        const object=this.snapshot().sceneObjects![task.targetId!]!,skill=this.snapshot().config.skillDefinitions!.find(definition=>definition.id===task.skillId)!;
        this.#journal.commit({type:'skill_completed',actorId:task.actorId,visibility:{type:'recipients',recipientIds:old.agentOrder.filter(id=>old.agents[id]!.locationId===object.locationId)},payload:{intentId:task.intentId,skillId:skill.id,title:skill.name,targetId:object.id,targetName:object.name,result:json(object.state)}});
      }
      this.#journal.commit({ type: 'task_completed', actorId: task.actorId, visibility: { type: 'recipients', recipientIds: [task.actorId] },
        payload: { intentId: task.intentId, taskId: task.taskId, type: task.type, destinationId: task.destinationId, income: task.income } });
    }
    for (const delivery of this.snapshot().pendingEvents.filter(message => message.dueTick <= nextTick)) {
      this.#journal.commit({ type: 'message_received', actorId: delivery.senderId,
        visibility: { type: 'recipients', recipientIds: [delivery.recipientId] }, sourceEventIds: [delivery.sentEventId],
        payload: { senderId: delivery.senderId, recipientId: delivery.recipientId, content: delivery.content, kind: delivery.kind } }, (state, eventId) => {
        const recipient = state.agents[delivery.recipientId]!;
        recipient.inbox.push({ eventId, senderId: delivery.senderId, content: delivery.content, kind: delivery.kind,
          receivedTick: nextTick, sourceEventIds: [delivery.sentEventId] });
        recipient.beliefs.push({ eventId, kind: 'reported_claim', content: delivery.content, sourceActorId: delivery.senderId });
        markDirty(recipient, 'message_received');
        state.pendingEvents = state.pendingEvents.filter(message => message.deliveryId !== delivery.deliveryId);
      });
    }
  }

  async #tick(generation: number): Promise<BatchSummary> {
    if (generation !== this.#generation || this.snapshot().status === 'cancelled') return { ...this.#empty(), cancelled: true };
    this.#controlBoundary(); this.#advanceClock();
    const atBoundary = this.snapshot(), order = this.#priority(atBoundary);
    const selected = order.filter(id => {
      const agent = atBoundary.agents[id]!;
      return agent.control !== 'human' && !agent.currentAction && agent.dirtyReasons.length > 0 &&
        (agent.nextDecisionTick <= atBoundary.tick || agent.dirtyReasons.includes('message_received'));
    });
    if (!selected.length) return this.#empty();
    const batchId = `${atBoundary.runId}:b${++this.#batchCounter}`;
    const controller = new AbortController();
    this.#journal.commit({ type: 'batch_started', batchId, visibility: { type: 'recipients', recipientIds: [] }, payload: { selectedAgentIds: selected } }, state => {
      state.status = 'deciding'; state.metrics.batches++;
      selected.forEach(id => { state.agents[id]!.mode = 'thinking'; });
    });
    const snapshot = this.snapshot();
    const budget = Math.max(0, snapshot.config.maxDecisionsPerRun - snapshot.metrics.decisionsRequested);
    const jobs: DecisionJob[] = selected.map(id => {
      const observation = buildObservation(snapshot, this.events(), id, batchId);
      return { jobId: `${batchId}:${id}`, runId: snapshot.runId, batchId, agentId: id, snapshotVersion: snapshot.worldVersion,
        observationHash: createHash('sha256').update(JSON.stringify(observation)).digest('hex'), observation,
        allowedActions: deepFreeze(allowedActions(snapshot, id)), deadlineWallTimeMs: null, status: 'queued' };
    });
    const batch: ActiveBatch = { batchId, generation, snapshotVersion: snapshot.worldVersion, controller, jobs };
    this.#active = batch;
    const results: ProviderResult[] = [];
    let cursor = 0;
    const timer = setTimeout(() => controller.abort('batch_timeout'), this.#options.batchTimeoutMs);
    try {
      const worker = async () => {
        while (cursor < jobs.length) {
          const index = cursor++, job = jobs[index]!;
          if (index >= budget) { results[index] = { raw: null, fallback: 'decision_budget_exhausted' }; job.status = 'fallback'; continue; }
          if (controller.signal.aborted) { results[index] = { raw: null, fallback: 'batch_timeout' }; job.status = 'fallback'; continue; }
          if (this.#providerOutstanding >= this.#options.maxConcurrency) { results[index] = { raw: null, fallback: 'provider_slots_still_occupied' }; job.status = 'fallback'; continue; }
          job.status = 'running'; job.deadlineWallTimeMs = Date.now() + this.#options.requestTimeoutMs;
          results[index] = await this.#callProvider(job, controller.signal);
          job.status = results[index]!.fallback ? 'fallback' : 'completed';
        }
      };
      await Promise.all(Array.from({ length: Math.min(this.#options.maxConcurrency, jobs.length) }, () => worker()));
      if (generation !== this.#generation || this.snapshot().status === 'cancelled') {
        jobs.forEach(job => { job.status = 'cancelled'; });
        return { batchId, tick: snapshot.tick, selectedAgentIds: selected, outcomes: [], cancelled: true };
      }
      // Metrics are settled at the boundary too, so in-flight command/clock state never leaks into observations.
      const outcomes = this.#settle(batch, results, Math.min(budget, jobs.filter(job => job.deadlineWallTimeMs !== null).length));
      return { batchId, tick: snapshot.tick, selectedAgentIds: selected, outcomes, cancelled: false };
    } finally {
      clearTimeout(timer);
      if (generation === this.#generation && this.#active === batch) { this.#lastJobs = jobs; this.#active = null; }
    }
  }

  #callProvider(job: DecisionJob, batchSignal: AbortSignal): Promise<ProviderResult> {
    return new Promise(resolve => {
      const controller = new AbortController();
      let completed = false;
      const finish = (result: ProviderResult) => {
        if (completed) return;
        completed = true; clearTimeout(timer); batchSignal.removeEventListener('abort', cancelled); resolve(result);
      };
      const cancelled = () => {
        controller.abort(batchSignal.reason);
        finish({ raw: null, fallback: batchSignal.reason === 'batch_timeout' ? 'batch_timeout' : 'batch_cancelled' });
      };
      const timer = setTimeout(() => { controller.abort('request_timeout'); finish({ raw: null, fallback: 'request_timeout' }); }, this.#options.requestTimeoutMs);
      batchSignal.addEventListener('abort', cancelled, { once: true });
      if (batchSignal.aborted) { cancelled(); return; }
      this.#providerOutstanding++;
      Promise.resolve().then(() => this.#provider.decide(job.observation, job.allowedActions, controller.signal))
        .then(raw => { this.#providerOutstanding--; finish({ raw, fallback: null }); },
          () => { this.#providerOutstanding--; finish({ raw: null, fallback: 'provider_error' }); });
    });
  }

  #priority(world: DeepReadonly<WorldState>): string[] {
    const offset = (world.tick - 1 + world.agentOrder.length) % world.agentOrder.length;
    return [...world.agentOrder.slice(offset), ...world.agentOrder.slice(0, offset)];
  }

  #settle(batch: ActiveBatch, results: ProviderResult[], requested: number): ActionOutcome[] {
    const intents: ActionIntent[] = [];
    const rawFailures: { agentId: string; reason: string }[] = [];
    for (const [index, job] of batch.jobs.entries()) {
      const result = results[index]!;
      let decision;
      let fallback = result.fallback;
      if (!fallback) {
        try { decision = parseDecision(result.raw); }
        catch { fallback = 'invalid_decision'; rawFailures.push({ agentId: job.agentId, reason: fallback }); }
      }
      if (fallback) {
        this.#journal.commit({ type: 'decision_fallback', batchId: batch.batchId, actorId: job.agentId,
          visibility: { type: 'recipients', recipientIds: [job.agentId] }, payload: { reason: fallback, replacement: 'wait(1)' } }, state => { state.metrics.decisionFallbacks++; });
        decision = { type: 'wait' as const, params: { durationTicks: 1 } };
      }
      if (!decision) throw new Error('Missing validated decision');
      intents.push({ ...decision, sourceEventIds: decision.sourceEventIds ?? [], intentSummary: decision.intentSummary ?? '',
        runId: job.runId, batchId: job.batchId, agentId: job.agentId, snapshotVersion: job.snapshotVersion, intentId: `${job.jobId}:intent` });
    }
    const world = this.snapshot(), order = this.#priority(world);
    intents.sort((a, b) => PHASE_ORDER.indexOf(ACTION_REGISTRY[a.type].phase) - PHASE_ORDER.indexOf(ACTION_REGISTRY[b.type].phase) || order.indexOf(a.agentId) - order.indexOf(b.agentId));
    const outcomes: ActionOutcome[] = [];
    for (const failure of rawFailures) this.#reject(failure.agentId, `${batch.batchId}:${failure.agentId}:malformed`, null, failure.reason, batch.batchId);
    for (const intent of intents) {
      const reason = intent.batchId !== batch.batchId || intent.snapshotVersion !== batch.snapshotVersion ? 'stale_batch' : validateIntent(this.snapshot(), intent, this.events());
      if (reason) {
        this.#reject(intent.agentId, intent.intentId, intent.type, reason, batch.batchId);
        outcomes.push({ agentId: intent.agentId, intentId: intent.intentId, type: intent.type, accepted: false, reason });
        continue;
      }
      const effect = ACTION_REGISTRY[intent.type].effect(this.snapshot(), intent);
      try {
        this.#journal.commit({ ...effect.event, payload: { ...effect.event.payload, intentId: intent.intentId, snapshotVersion: intent.snapshotVersion } }, effect.apply);
        this.#journal.commit({ type: 'action_accepted', batchId: batch.batchId, actorId: intent.agentId,
          visibility: { type: 'recipients', recipientIds: [intent.agentId] }, payload: { intent: json(intent) } }, state => {
          state.metrics.acceptedActions++;
          const agent = state.agents[intent.agentId]!;
          if (!agent.currentAction) { agent.mode = 'idle'; markDirty(agent, 'action_completed'); }
        });
        outcomes.push({ agentId: intent.agentId, intentId: intent.intentId, type: intent.type, accepted: true, reason: null });
      } catch {
        this.#reject(intent.agentId, intent.intentId, intent.type, 'effect_invariant_failed', batch.batchId);
        outcomes.push({ agentId: intent.agentId, intentId: intent.intentId, type: intent.type, accepted: false, reason: 'effect_invariant_failed' });
      }
    }
    this.#journal.commit({ type: 'batch_completed', batchId: batch.batchId, visibility: { type: 'recipients', recipientIds: [] },
      payload: { outcomes: json(outcomes), requestedDecisions: requested } }, state => {
      state.metrics.decisionsRequested += requested;
      for (const job of batch.jobs) {
        const agent = state.agents[job.agentId]!;
        agent.lastDecisionTick = state.tick;
        agent.nextDecisionTick = state.tick + state.config.decisionCooldownTicks;
        agent.dirtyReasons = outcomes.some(outcome => outcome.agentId === agent.id && !outcome.accepted) ? ['action_rejected'] : agent.currentAction ? [] : ['action_completed'];
        if (agent.mode === 'thinking') agent.mode = 'idle';
      }
      state.status = this.#continueRunning ? 'running' : 'paused';
    });
    return outcomes;
  }
  #reject(agentId: string, intentId: string, type: string | null, reason: string, batchId: string) {
    this.#journal.commit({ type: 'action_rejected', batchId, actorId: agentId, visibility: { type: 'recipients', recipientIds: [agentId] },
      payload: { intentId, type, reason } }, state => {
      state.metrics.rejectedActions++; markDirty(state.agents[agentId]!, 'action_rejected');
    });
  }

  #applyHumanAction(commandId: string, action: import('../shared/types.js').DecisionResult) {
    const world = this.snapshot();
    const player = Object.values(world.agents).find(agent => agent.control === 'human');
    const batchId = `${world.runId}:human:${commandId}`;
    if (!player) {
      this.#journal.commit({ type: 'command_rejected', visibility: { type: 'recipients', recipientIds: [] }, payload: { commandId, reason: 'no_human_character' } }, state => {
        state.pendingExternalCommands = state.pendingExternalCommands.filter(command => command.commandId !== commandId);
      });
      return;
    }
    const intent: ActionIntent = { ...action, intentId: `${batchId}:intent`, batchId, runId: world.runId,
      agentId: player.id, snapshotVersion: world.worldVersion, sourceEventIds: action.sourceEventIds ?? [], intentSummary: '' };
    const reason = validateIntent(world, intent, this.events());
    if (reason) this.#reject(player.id, intent.intentId, intent.type, reason, batchId);
    else {
      const effect = ACTION_REGISTRY[intent.type].effect(world, intent);
      try {
        this.#journal.commit({ ...effect.event, payload: { ...effect.event.payload, intentId: intent.intentId, controlledBy: 'player' } }, effect.apply);
        this.#journal.commit({ type: 'action_accepted', actorId: player.id, batchId, visibility: { type: 'recipients', recipientIds: [player.id] },
          payload: { intent: json(intent), controlledBy: 'player' } }, state => { state.metrics.acceptedActions++; });
      } catch { this.#reject(player.id, intent.intentId, intent.type, 'effect_invariant_failed', batchId); }
    }
    this.#journal.commit({ type: 'external_command_received', visibility: { type: 'recipients', recipientIds: [] }, payload: { commandId, applied: true } }, state => {
      state.pendingExternalCommands = state.pendingExternalCommands.filter(command => command.commandId !== commandId);
    });
  }
}
