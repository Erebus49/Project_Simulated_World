import { z } from 'zod';

export const locationIds = ['square', 'archive', 'tavern', 'docks', 'lighthouse', 'hargrave-home', 'scrapyard', 'crash-site', 'gove-motel', 'command-post', 'lomax-farm', 'checkpoint'] as const;
export const actorIds = ['lin', 'mora', 'roan', 'eira', 'silas'] as const;
export const investigatorIds = ['avery', 'morgan', 'reed'] as const;
export const killerActorIds = [...investigatorIds, 'hargrave', 'pete', 'buddy', 'hudson', 'drako'] as const;
export const allActorIds = [...actorIds, ...killerActorIds] as const;
export const actionKinds = ['move', 'investigate', 'talk', 'share', 'calm', 'rest', 'seal', 'operate', 'freeform'] as const;
export type LocationId = typeof locationIds[number];
export type ActorId = typeof allActorIds[number];
export type ScenarioId = 'fogbound' | 'killer';
export const cocSkillNames = { spotHidden: '侦查', listen: '聆听', medicine: '医学', library: '图书馆利用', electrical: '电器维修', mechanical: '机械维修', heavyMachinery: '重型机械', persuade: '说服', psychology: '心理学', stealth: '潜行', science: '物理学', firstAid: '急救' } as const;
export type CocSkill = keyof typeof cocSkillNames;
export type ActionKind = typeof actionKinds[number];
export type Viewer = ActorId | 'director';

export const actionSchema = z.object({
  kind: z.enum(actionKinds),
  target: z.string().max(60).optional(),
  clueId: z.string().max(60).optional(),
  speech: z.string().max(400).default(''),
}).strict();
export type Action = z.infer<typeof actionSchema>;
export const decisionSchema = z.object({
  action: actionSchema,
  intent: z.string().min(1).max(220),
  reply: z.string().max(280).optional(),
  shareClueId: z.string().max(60).optional(),
  acceptsCooperation: z.boolean().optional(),
}).strict();
export type Decision = z.infer<typeof decisionSchema>;
export type Attributes = { investigation: number; persuasion: number; resolve: number; agility: number };
export interface Memory { id: string; round: number; text: string; locationId: LocationId }
export interface Actor {
  id: ActorId; name: string; subtitle: string; role: 'PL' | 'NPC'; color: string;
  personality: string; backstory: string; publicGoal: string; privateGoal: string; secret: string;
  behavior: 'curious' | 'protective' | 'ambitious' | 'guarded' | 'sociable';
  attributes: Attributes; hp: number; maxHp: number; sanity: number; maxSanity: number;
  locationId: LocationId; knownClues: string[]; visited: LocationId[];
  memories: Memory[]; relationships: Record<ActorId, number>;
  knownFacts?: string[];
  /** Local 2D position inside the current scene. */
  position?: { x: number; y: number };
  skills?: Record<CocSkill, number>; inventory?: string[];
}
export interface Place {
  id: LocationId; name: string; description: string; x: number; y: number;
  neighbors: LocationId[]; flavor: string;
}
export interface Clue { id: string; title: string; text: string; locationId: LocationId; dc: number; searchLabel?: string; skill?: CocSkill; requires?: string[]; minRound?: number; nightOnly?: boolean; position?: { x: number; y: number } }
export interface Check { die: number; modifier: number; total: number; dc: number; success: boolean; skill: keyof Attributes; sides?: 100; skillName?: string; level?: string }
export interface GameEvent {
  id: string; round: number; actorId?: ActorId; kind: ActionKind | 'world' | 'interrupted' | 'dialogue';
  locationId: LocationId; text: string; visibleTo: ActorId[]; private: boolean;
  check?: Check;
  replyTo?: ActorId; clueIds?: string[];
}
export interface Round {
  number: number; narration: string;
  decisions: Partial<Record<ActorId, Decision>>; events: GameEvent[];
  narrations?: Partial<Record<ActorId, string>>;
}
export interface InvestigationState {
  playerChosen: boolean; authoritiesAllied: boolean; magnetAccess: boolean;
  magnetsReady: boolean; deployedMagnets: number; contained: boolean; broodNeutralized: boolean;
  attempts: Record<string, number>; endingKind?: 'containment' | 'incomplete' | 'evacuated' | 'overrun' | 'casualty';
}
export interface ActionOption { label: string; action: Action; description?: string; skill?: string; position?: { x: number; y: number } }
export interface World {
  version: 1; id: string; title: string; createdAt: string; updatedAt: string;
  revision: number; round: number; maxRounds: number; elapsedMinutes: number;
  status: 'active' | 'saved' | 'lost'; danger: number;
  ending: string | null; actors: Actor[]; history: Round[];
  scenarioId?: ScenarioId; playerActorId?: ActorId; investigation?: InvestigationState;
  agentMode?: 'demo' | 'llm';
}
export interface ActorView extends Omit<Actor, 'privateGoal' | 'secret' | 'memories' | 'knownClues' | 'relationships' | 'locationId'> {
  locationId: LocationId | null; privateGoal?: string; secret?: string;
  memories: Memory[]; knownClues: string[]; relationships?: Record<ActorId, number>;
}
export interface WorldView extends Omit<World, 'actors' | 'history'> {
  viewer: Viewer; actors: ActorView[]; clues: Clue[]; history: Round[];
  availableActions?: ActionOption[]; currentObjective?: string;
  places: Place[];
}
export interface WorldSummary { id: string; title: string; round: number; status: World['status']; updatedAt: string }
export interface Settings { mode: 'demo' | 'llm'; baseUrl: string; model: string; apiKey: string }
export type SettingsView = Omit<Settings, 'apiKey'> & { hasApiKey: boolean };
export type TurnProgress = { type: 'phase'; message: string } | { type: 'agent'; actorId: ActorId; status: 'thinking' | 'ready' } | { type: 'complete'; world: WorldView } | { type: 'error'; message: string };

export const profilePatchSchema = z.object({
  personality: z.string().min(1).max(500), publicGoal: z.string().min(1).max(300),
  privateGoal: z.string().min(1).max(500), behavior: z.enum(['curious', 'protective', 'ambitious', 'guarded', 'sociable']),
});
