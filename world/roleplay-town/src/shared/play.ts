import type { AgentObservation, AgentMode, DeepReadonly, LocationState, Position, SceneObject, SkillActivity, VisibleEvent } from './types.js';

interface PlayerProjection {
  runId: string;
  tick: number;
  started: boolean;
  busy: boolean;
  autonomous?:boolean;
  configured: boolean;
  mode: 'llm' | 'mock';
  model: string;
  error: string;
  notice: string;
  setting: { title: string; background: string; publicFacts: string[]; playerHook: string };
  player: AgentObservation['self'];
  locations: LocationState[];
  roster: { id: string; name: string; bio: string; nearby: boolean; mode: AgentMode | null;
    appearance?: { locationId: string; position?:Position;activity?:SkillActivity|null;movement: { id: string; from: string; to: string; phase: 'walking' | 'arrived' } | null } | null }[];
  objects?:SceneObject[];
  shops: AgentObservation['shops'];
  events: VisibleEvent[];
}
export type PlayView = DeepReadonly<PlayerProjection>;
