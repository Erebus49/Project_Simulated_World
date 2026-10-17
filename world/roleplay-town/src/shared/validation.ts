import type { ActionParameters, ActionType, DecisionResult, ExternalCommand, JsonValue } from './types.js';

export const ACTION_TYPES: readonly ActionType[] = ['send_message', 'move', 'buy', 'set_price', 'work', 'wait', 'use_skill'];
export class ValidationError extends Error {}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new ValidationError(`${label} contains unknown fields: ${extra.join(', ')}`);
}
export function string(value: unknown, label: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ValidationError(`${label} must contain 1–${max} characters`);
  return value.trim();
}
export function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ValidationError(`${label} must be an integer in [${min}, ${max}]`);
  return value;
}
export function sourceIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new ValidationError('sourceEventIds must contain at most 8 event IDs');
  const ids = value.map(id => string(id, 'sourceEventId', 160));
  if (new Set(ids).size !== ids.length) throw new ValidationError('duplicate sourceEventIds');
  return ids;
}

/** Parses untrusted proposals, never trusts a provider's identity or batch fields. */
export function parseDecision(value: unknown): DecisionResult {
  const input = object(value, 'decision');
  exactKeys(input, ['type', 'params', 'sourceEventIds', 'intentSummary'], 'decision');
  if (!ACTION_TYPES.includes(input.type as ActionType)) throw new ValidationError('unknown action type');
  const type = input.type as ActionType;
  const params = object(input.params, 'params');
  let action: ActionParameters;
  switch (type) {
    case 'use_skill':
      exactKeys(params,['skillId','targetId','speech'],'use_skill.params');
      action={type,params:{skillId:string(params.skillId,'skillId'),targetId:string(params.targetId,'targetId'),
        ...(params.speech===undefined?{}:{speech:string(params.speech,'speech',100)})}}; break;
    case 'send_message':
      exactKeys(params, ['targetId', 'content'], 'send_message.params');
      action = { type, params: { targetId: string(params.targetId, 'targetId'), content: string(params.content, 'content', 240) } }; break;
    case 'move':
      exactKeys(params, ['destinationId'], 'move.params');
      action = { type, params: { destinationId: string(params.destinationId, 'destinationId') } }; break;
    case 'buy':
      exactKeys(params, ['shopId', 'quantity', 'maxUnitPrice'], 'buy.params');
      action = { type, params: { shopId: string(params.shopId, 'shopId'), quantity: integer(params.quantity, 'quantity', 1, 8), maxUnitPrice: integer(params.maxUnitPrice, 'maxUnitPrice', 1, 1_000_000) } }; break;
    case 'set_price':
      exactKeys(params, ['shopId', 'unitPrice'], 'set_price.params');
      action = { type, params: { shopId: string(params.shopId, 'shopId'), unitPrice: integer(params.unitPrice, 'unitPrice', 1, 1_000_000) } }; break;
    case 'work':
    case 'wait':
      exactKeys(params, ['durationTicks'], `${type}.params`);
      action = { type, params: { durationTicks: integer(params.durationTicks, 'durationTicks', 1, 100) } }; break;
  }
  const result: DecisionResult = { ...action, sourceEventIds: sourceIds(input.sourceEventIds) };
  if (input.intentSummary !== undefined) result.intentSummary = string(input.intentSummary, 'intentSummary', 120);
  return result;
}

export function parseCommand(value: unknown): ExternalCommand {
  const input = object(value, 'command');
  if (input.type === 'player_action') {
    exactKeys(input, ['commandId', 'type', 'action'], 'command');
    return { commandId: string(input.commandId, 'commandId'), type: input.type, action: parseDecision(input.action) };
  }
  if (input.type === 'set_speech_limit') {
    exactKeys(input, ['commandId', 'type', 'enabled', 'dailyLimit'], 'command');
    if (typeof input.enabled !== 'boolean') throw new ValidationError('enabled must be boolean');
    return { commandId: string(input.commandId, 'commandId'), type: input.type, enabled: input.enabled,
      dailyLimit: integer(input.dailyLimit, 'dailyLimit', 0, 1000) };
  }
  exactKeys(input, ['commandId', 'type', 'recipientId', 'content'], 'command');
  if (input.type !== 'inject_message') throw new ValidationError('P0 only supports inject_message commands');
  return { commandId: string(input.commandId, 'commandId'), type: input.type, recipientId: string(input.recipientId, 'recipientId'), content: string(input.content, 'content', 240) };
}

export function clone<T>(value: T): T { return structuredClone(value); }
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(child => deepFreeze(child)); Object.freeze(value); }
  return value;
}
export function json(value: unknown): JsonValue { return JSON.parse(JSON.stringify(value)) as JsonValue; }
