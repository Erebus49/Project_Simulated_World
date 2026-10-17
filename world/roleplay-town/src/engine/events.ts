import type { DeepReadonly, JsonValue, RuntimeArchive, WorldEvent, WorldState } from '../shared/types.js';
import { clone, deepFreeze, json } from '../shared/validation.js';
import { assertWorld } from './invariants.js';

export interface EventInput {
  type: WorldEvent['type'];
  batchId?: string | null;
  actorId?: string | null;
  visibility?: WorldEvent['visibility'];
  sourceEventIds?: string[];
  payload?: Record<string, JsonValue>;
}
const MEMORY_TYPES = new Set<WorldEvent['type']>(['rumor_injected', 'message_sent', 'message_received', 'purchase_completed', 'price_changed', 'task_completed', 'action_rejected', 'decision_fallback','skill_started','skill_completed']);

/** The sole state owner. Transactions replace the whole candidate after validation. */
export class EventJournal {
  #state: WorldState;
  #initial: WorldState;
  #events: WorldEvent[] = [];
  constructor(initial: WorldState) {
    assertWorld(initial);
    this.#state = clone(initial); this.#initial = clone(initial);
  }
  snapshot(): DeepReadonly<WorldState> { return deepFreeze(clone(this.#state)); }
  events(): DeepReadonly<WorldEvent[]> { return deepFreeze(clone(this.#events)); }
  archive(): RuntimeArchive { return clone({ schemaVersion: 3, initialState: this.#initial, events: this.#events, finalState: this.#state }); }
  commit(input: EventInput, mutate: (candidate: WorldState, eventId: string) => void = () => {}): WorldEvent {
    const before = this.#state, candidate = clone(before);
    const eventSeq = this.#events.length + 1, eventId = `${before.runId}:e${eventSeq}`;
    mutate(candidate, eventId);
    if (candidate.runId !== before.runId) throw new Error('runId cannot change inside a transaction');
    candidate.worldVersion = before.worldVersion + 1;
    const visibility = input.visibility ?? { type: 'public' as const };
    const recipients = visibility.type === 'public' ? candidate.agentOrder : visibility.recipientIds;
    for (const id of new Set(recipients)) {
      const agent = candidate.agents[id];
      if (!agent) throw new Error(`Unknown event recipient ${id}`);
      agent.seenEventIds.push(eventId);
      if (MEMORY_TYPES.has(input.type)) {
        agent.recentMemory.push(eventId);
        agent.recentMemory = agent.recentMemory.slice(-24);
      }
    }
    assertWorld(candidate);
    const differences = (Object.keys(candidate) as (keyof WorldState)[])
      .filter(key => JSON.stringify(before[key]) !== JSON.stringify(candidate[key]))
      .map(key => ({ path: String(key), before: json(before[key]), after: json(candidate[key]) }));
    const event: WorldEvent = {
      eventId, eventSeq, runId: candidate.runId, worldVersion: candidate.worldVersion, tick: candidate.tick,
      batchId: input.batchId ?? null, actorId: input.actorId ?? null, type: input.type,
      visibility: clone(visibility), sourceEventIds: [...(input.sourceEventIds ?? [])], payload: clone(input.payload ?? {}), differences,
    };
    this.#state = candidate; this.#events.push(event);
    return deepFreeze(clone(event));
  }
}

/** Exact reconstruction of committed state, without calling any decision provider. */
export function replay(initial: WorldState, events: readonly WorldEvent[]): WorldState {
  const state = clone(initial);
  let seq = 0;
  for (const event of events) {
    if (event.runId !== state.runId || event.eventSeq !== ++seq || event.worldVersion !== state.worldVersion + 1 || event.eventId !== `${state.runId}:e${seq}`) throw new Error('Replay identity/sequence mismatch');
    const paths = new Set<string>();
    for (const diff of event.differences) {
      if (!Object.hasOwn(state, diff.path) || paths.has(diff.path)) throw new Error('Replay unknown/duplicate state path');
      paths.add(diff.path);
      const key = diff.path as keyof WorldState;
      if (JSON.stringify(state[key]) !== JSON.stringify(diff.before)) throw new Error(`Replay before-state mismatch: ${key}`);
      (state as unknown as Record<string, JsonValue>)[key] = clone(diff.after);
    }
    if (state.worldVersion !== event.worldVersion || state.tick !== event.tick) throw new Error('Replay event/state mismatch');
    assertWorld(state);
  }
  return state;
}
