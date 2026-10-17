export type Point = { x: number; y: number };
export type Action = { action: string; target_id?: string; item_id?: string; interaction?: string; message?: string; private?: boolean; code?: string };
export type NpcMotion = { revision: number; sampled_at: number; phase: 'walking' | 'working' | 'paused'; path: Point[]; speed: number; work_left: number; task_id: string };
export type Person = { id: string; name: string; role: string; color: string; location: string | null; visible: boolean; position?: Point; nearby?: boolean; activity?: string; ambient_speech?: string; moving?: boolean; thinking?: boolean; motion?: NpcMotion | null };
export type WorldEvent = { id: number; turn: number; actor_id: string; kind: string; text: string; details: Record<string, any>; causes: number[] };
export type Game = {
  id: string; scenario_id?: 'night' | 'festival'; mode: 'demo' | 'ai'; status: 'playing' | 'won' | 'lost'; version: number;
  player_position?: Point;
  mystery?: { clues: { id: string; title: string; text: string; source: string }[]; anomalies: number; max_anomalies: number; muted: boolean; sealed: boolean; power_off: boolean; locker_open: boolean; escaped: boolean; anchors: ({ id: string; name: string; room: string; actions: string[]; nearby: boolean } & Point)[]; walkable: number[][]; obstacles?: number[][]; world_size?: { width: number; height: number } };
  turn: number; max_turns: number; remaining: number; busy: boolean; cursor: number;
  actor: { id: string; name: string; role: string; location: string };
  room: { id: string; name: string; description: string; exits: string[] };
  people: Person[]; visible_people: Person[];
  items: { id: string; name: string; holder: string | null; location: string | null }[];
  known_facilities: Record<string, boolean | number>; events: WorldEvent[]; legal_actions: Action[];
};
export type Settings = { base_url: string; model: string; has_api_key: boolean; timeout_seconds: number };
export type Scenario = { title: string; characters: Record<string, { name: string; role: string; color: string; goal: string }> };

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '请求未完成，请检查输入或稍后再试');
  return data;
}
