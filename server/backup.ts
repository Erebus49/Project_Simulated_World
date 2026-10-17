import { z } from 'zod';
import { actorIds, actionKinds, decisionSchema, locationIds, type World } from '../shared/types';
import { clues } from '../shared/scenario';

const id = z.enum(actorIds);
const location = z.enum(locationIds);
const text = z.string().max(5000);
const memory = z.object({ id: z.string().max(100), round: z.number().int().min(0).max(12), text, locationId: location });
const attrs = z.object({ investigation: z.number().int().min(0).max(8), persuasion: z.number().int().min(0).max(8), resolve: z.number().int().min(0).max(8), agility: z.number().int().min(0).max(8) });
const actor = z.object({
  id, name: z.string().min(1).max(30), subtitle: text, role: z.enum(['PL', 'NPC']), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  personality: text, backstory: text, publicGoal: text, privateGoal: text, secret: text,
  behavior: z.enum(['curious', 'protective', 'ambitious', 'guarded', 'sociable']), attributes: attrs,
  hp: z.number().int().min(0).max(30), maxHp: z.number().int().min(1).max(30),
  sanity: z.number().int().min(0).max(30), maxSanity: z.number().int().min(1).max(30),
  locationId: location, knownClues: z.array(z.string()).max(4), visited: z.array(location).max(5),
  memories: z.array(memory).max(80), relationships: z.object({ lin: z.number().min(-5).max(5), mora: z.number().min(-5).max(5), roan: z.number().min(-5).max(5), eira: z.number().min(-5).max(5), silas: z.number().min(-5).max(5) }),
});
const event = z.object({
  id: z.string().max(100), round: z.number().int().min(0).max(12), actorId: id.optional(),
  kind: z.enum([...actionKinds, 'world', 'interrupted']), locationId: location, text,
  visibleTo: z.array(id).max(5), private: z.boolean(),
  check: z.object({ die: z.number().int().min(1).max(20), modifier: z.number().int().min(0).max(8), total: z.number().int().min(1).max(28), dc: z.number().int().min(1).max(30), success: z.boolean(), skill: z.enum(['investigation', 'persuasion', 'resolve', 'agility']) }).optional(),
});
export const backupSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), title: z.string().min(1).max(80),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), revision: z.number().int().min(0),
  round: z.number().int().min(0).max(12), maxRounds: z.literal(12), status: z.enum(['active', 'saved', 'lost']),
  danger: z.number().int().min(0).max(12), ending: z.string().max(2400).nullable(), actors: z.array(actor).length(5),
  history: z.array(z.object({ number: z.number().int().min(0).max(12), narration: text, decisions: z.record(id, decisionSchema), events: z.array(event).max(30) })).min(1).max(13),
}).superRefine((world, ctx) => {
  const validClues = new Set(clues.map(c => c.id));
  if (new Set(world.actors.map(a => a.id)).size !== 5) ctx.addIssue({ code: 'custom', message: '角色ID重复' });
  for (const a of world.actors) {
    if (a.hp > a.maxHp || a.sanity > a.maxSanity || a.knownClues.some(c => !validClues.has(c)) || new Set(a.knownClues).size !== a.knownClues.length) ctx.addIssue({ code: 'custom', message: '人物卡状态无效' });
  }
  if (world.history.length !== world.round + 1 || world.history.some((r, i) => r.number !== i)) ctx.addIssue({ code: 'custom', message: '回合记录不连续' });
  if ((world.status === 'active' && (world.round >= 12 || world.danger >= 12 || world.ending !== null)) || (world.status !== 'active' && !world.ending)) ctx.addIssue({ code: 'custom', message: '结局与世界状态不一致' });
});
export function parseBackup(input: unknown): World { return backupSchema.parse(input) as World; }
