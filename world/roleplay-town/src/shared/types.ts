export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
// Bound expansion of recursive JsonValue payloads; runtime freezing has no depth limit.
export type DeepReadonly<T, Depth extends readonly unknown[] = []> =
  Depth['length'] extends 10 ? Readonly<T> : T extends (...args: never[]) => unknown ? T :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K], [...Depth, unknown]> } : T;
export type RunStatus = 'paused' | 'running' | 'deciding' | 'cancelled';
export type AgentMode = 'idle' | 'executing' | 'waiting' | 'thinking';
export type ActionType = 'send_message' | 'move' | 'buy' | 'set_price' | 'work' | 'wait' | 'use_skill';
export type ActionPhase = 'message' | 'resource' | 'task';
export type DirtyReason = 'initial' | 'action_completed' | 'message_received' | 'action_rejected' | 'rule_changed';
export type Role = 'owner' | 'barista' | 'customer' | 'supplier' | 'messenger' | 'player';
export interface Position { x:number; y:number }
export type ActivityKind = 'hands' | 'read' | 'write' | 'photo' | 'tidy' | 'rest';
export interface CharacterDefinition { values:string[]; habits:string[]; boundaries:string[]; relationships:Record<string,string>; skillIds:string[] }
export interface SceneObject { id:string;name:string;locationId:string;position:Position;approach:Position;tags:string[];state:Record<string,number>;reservedBy:string|null }
export interface SkillDefinition { id:string;name:string;description:string;targetTags:string[];durationTicks:number;animation:ActivityKind;cooldownTicks:number;
  effect:{stat?:string;amount?:number;maximum?:number;item?:string;shopStock?:number} }
export interface SkillActivity { intentId:string;skillId:string;targetId:string;title:string;animation:ActivityKind;stage:'approaching'|'acting';
  from:Position;to:Position;startedTick:number;actAtTick:number;dueTick:number;speech:string }

export interface AgentConfig {
  id: string;
  name: string;
  profile: { role: Role; description: string; shareRumors: boolean };
  goals: string[];
  locationId: string;
  money: number;
  inventory: Record<string, number>;
  relationshipIds: string[];
  workLocationIds: string[];
  control?: 'human' | 'llm';
  publicBio?: string;
  character?: CharacterDefinition;
  position?: Position;
}

export interface CoffeeConfig {
  runId: string;
  seed: number;
  agents: AgentConfig[];
  ticksPerDay: number;
  decisionCooldownTicks: number;
  maxDecisionsPerRun: number;
  movementDurationTicks: number;
  maxDurationTicks: number;
  wagePerTick: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  initialUnitPrice: number;
  initialStock: number;
  speechLimit: number | null;
  setting?: { title: string; background: string; publicFacts: string[]; playerHook: string };
  sceneObjects?: SceneObject[];
  skillDefinitions?: SkillDefinition[];
}

export interface LocationState { id: string; name: string; neighborIds: string[] }
export interface ShopState { id: string; name: string; locationId: string; ownerId: string; unitPrice: number; stock: number }
export interface SpeechLimitRule { id: string; type: 'speech_limit'; enabled: boolean; dailyLimit: number; effectiveTick: number }

export type ActionParameters =
  | { type: 'send_message'; params: { targetId: string; content: string } }
  | { type: 'move'; params: { destinationId: string } }
  | { type: 'buy'; params: { shopId: string; quantity: number; maxUnitPrice: number } }
  | { type: 'set_price'; params: { shopId: string; unitPrice: number } }
  | { type: 'work'; params: { durationTicks: number } }
  | { type: 'wait'; params: { durationTicks: number } }
  | { type: 'use_skill'; params: { skillId:string; targetId:string; speech?:string } };
export type DecisionResult = ActionParameters & { sourceEventIds?: string[]; intentSummary?: string };
export type ActionIntent = ActionParameters & {
  intentId: string;
  runId: string;
  batchId: string;
  agentId: string;
  snapshotVersion: number;
  sourceEventIds: string[];
  intentSummary: string;
};

export interface InboxMessage {
  eventId: string;
  senderId: string | null;
  content: string;
  kind: 'rumor' | 'statement' | 'retelling';
  receivedTick: number;
  sourceEventIds: string[];
}
export interface Belief { eventId: string; kind: 'reported_claim'; content: string; sourceActorId: string | null }
export interface CurrentAction { intentId: string; type: ActionType; startedTick: number; dueTick: number }
export interface AgentState extends AgentConfig {
  mode: AgentMode;
  // P0 supports a single action only. Multi-step plans remain explicitly empty.
  plan: DecisionResult[];
  currentAction: CurrentAction | null;
  nextDecisionTick: number;
  lastDecisionTick: number | null;
  inbox: InboxMessage[];
  beliefs: Belief[];
  recentMemory: string[];
  seenEventIds: string[];
  speechCount: number;
  dayIndex: number;
  dirtyReasons: DirtyReason[];
  activity?: SkillActivity | null;
  skillHistory?: Record<string,number>;
}

export interface ScheduledTask {
  taskId: string;
  actorId: string;
  intentId: string;
  type: 'move' | 'work' | 'wait' | 'use_skill';
  dueTick: number;
  destinationId: string | null;
  income: number;
  skillId?:string;
  targetId?:string;
}
export interface PendingDelivery {
  deliveryId: string;
  dueTick: number;
  senderId: string;
  recipientId: string;
  sentEventId: string;
  content: string;
  kind: 'statement' | 'retelling';
}
export interface InjectMessageCommand { commandId: string; type: 'inject_message'; recipientId: string; content: string }
export interface SpeechRuleCommand { commandId: string; type: 'set_speech_limit'; enabled: boolean; dailyLimit: number }
export interface PlayerActionCommand { commandId: string; type: 'player_action'; action: DecisionResult }
export type ExternalCommand = InjectMessageCommand | SpeechRuleCommand | PlayerActionCommand;

export type EventType = 'run_initialized' | 'run_started' | 'run_paused' | 'run_cancelled' | 'tick_advanced' | 'day_started'
  | 'external_command_received' | 'command_rejected' | 'rumor_injected' | 'batch_started' | 'batch_completed'
  | 'action_accepted' | 'action_rejected' | 'decision_fallback' | 'message_sent' | 'message_received'
  | 'purchase_completed' | 'price_changed' | 'task_scheduled' | 'task_completed' | 'rule_changed' | 'skill_started' | 'skill_completed';
export interface StateDifference { path: string; before: JsonValue; after: JsonValue }
export interface WorldEvent {
  eventId: string;
  eventSeq: number;
  runId: string;
  worldVersion: number;
  tick: number;
  batchId: string | null;
  actorId: string | null;
  type: EventType;
  visibility: { type: 'public' } | { type: 'recipients'; recipientIds: string[] };
  sourceEventIds: string[];
  payload: Record<string, JsonValue>;
  differences: StateDifference[];
}
export type VisibleEvent = Omit<WorldEvent, 'differences' | 'visibility' | 'worldVersion'>;

export interface RuntimeMetrics {
  decisionsRequested: number;
  decisionFallbacks: number;
  batches: number;
  acceptedActions: number;
  rejectedActions: number;
  transactions: number;
  messagesSent: number;
  workIncomeCreated: number;
}
export interface WorldState {
  runId: string;
  schemaVersion: 3;
  worldVersion: number;
  tick: number;
  seed: number;
  status: RunStatus;
  agentOrder: string[];
  agents: Record<string, AgentState>;
  locations: Record<string, LocationState>;
  shops: Record<string, ShopState>;
  rules: Record<string, SpeechLimitRule>;
  scheduledTasks: ScheduledTask[];
  pendingEvents: PendingDelivery[];
  pendingExternalCommands: ExternalCommand[];
  metrics: RuntimeMetrics;
  config: Omit<CoffeeConfig, 'agents'>;
  sceneObjects?:Record<string,SceneObject>;
}

export interface AllowedAction { type: ActionType; phase: ActionPhase; description: string }
export interface AgentObservation {
  runId: string;
  batchId: string;
  snapshotVersion: number;
  tick: number;
  dayIndex: number;
  self: Pick<AgentState, 'id' | 'name' | 'profile' | 'goals' | 'locationId' | 'money' | 'inventory' | 'plan' | 'currentAction' | 'speechCount' | 'workLocationIds' | 'position'>;
  nearbyAgents: { id: string; name: string; mode: AgentMode }[];
  reachableAgentIds: string[];
  locations: LocationState[];
  // Price posters and shop ownership are public in this scenario. Stock is local.
  shops: { id: string; name: string; locationId: string; ownerId: string; unitPrice: number; stock: number | null }[];
  rules: SpeechLimitRule[];
  inbox: InboxMessage[];
  beliefs: Belief[];
  recentMemory: VisibleEvent[];
  newEvents: VisibleEvent[];
  dirtyReasons: DirtyReason[];
  limits: { minUnitPrice: number; maxUnitPrice: number; maxDurationTicks: number };
  setting?: CoffeeConfig['setting'];
  character?:CharacterDefinition;
  skills?:SkillDefinition[];
  objects?:SceneObject[];
  skillHistory?:Record<string,number>;
}
export interface DecisionJob {
  jobId: string;
  batchId: string;
  runId: string;
  agentId: string;
  snapshotVersion: number;
  observationHash: string;
  observation: DeepReadonly<AgentObservation>;
  allowedActions: readonly AllowedAction[];
  deadlineWallTimeMs: number | null;
  status: 'queued' | 'running' | 'completed' | 'fallback' | 'cancelled';
}
export interface DecisionProvider {
  readonly name: string;
  decide(observation: DeepReadonly<AgentObservation>, allowedActions: readonly AllowedAction[], signal: AbortSignal): unknown | Promise<unknown>;
}
export interface ActionOutcome { agentId: string; intentId: string; type: ActionType | null; accepted: boolean; reason: string | null }
export interface BatchSummary { batchId: string | null; tick: number; selectedAgentIds: string[]; outcomes: ActionOutcome[]; cancelled: boolean }

export interface RuntimeOptions {
  maxConcurrency?: number;
  requestTimeoutMs?: number;
  batchTimeoutMs?: number;
}
export interface RuntimeArchive {
  schemaVersion: 3;
  initialState: WorldState;
  events: WorldEvent[];
  finalState: WorldState;
}
