export const ACTIVITY_KINDS=['hands','read','write','photo','tidy','rest'] as const;
export type ActivityKind=typeof ACTIVITY_KINDS[number];
