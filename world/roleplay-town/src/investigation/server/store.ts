import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Settings, SettingsView, World, WorldSummary } from '../shared/types.js';

export class ConflictError extends Error {}
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, title TEXT NOT NULL, round INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);`);
  }
  list(): WorldSummary[] {
    return (this.db.prepare('SELECT id, title, round, status, updated_at AS updatedAt FROM worlds ORDER BY updated_at DESC').all() as unknown as WorldSummary[]);
  }
  get(id: string): World | null {
    const row = this.db.prepare('SELECT data FROM worlds WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as World : null;
  }
  save(world: World, expectedRevision?: number) {
    if (expectedRevision === undefined) {
      this.db.prepare('INSERT INTO worlds (id,title,round,status,updated_at,revision,data) VALUES (?,?,?,?,?,?,?)').run(world.id, world.title, world.round, world.status, world.updatedAt, world.revision, JSON.stringify(world));
    } else {
      const result = this.db.prepare('UPDATE worlds SET title=?, round=?, status=?, updated_at=?, revision=?, data=? WHERE id=? AND revision=?').run(world.title, world.round, world.status, world.updatedAt, world.revision, JSON.stringify(world), world.id, expectedRevision);
      if (result.changes !== 1) throw new ConflictError('存档已更新，请刷新后重试。');
    }
  }
  settings(): Settings {
    const row = this.db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string } | undefined;
    if (row) return JSON.parse(row.data) as Settings;
    return {
      mode: process.env.MODEL_API_KEY ? 'llm' : 'demo',
      baseUrl: process.env.MODEL_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.MODEL_NAME || 'deepseek-chat', apiKey: process.env.MODEL_API_KEY || '',
    };
  }
  saveSettings(settings: Settings) { this.db.prepare('INSERT INTO settings (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(settings)); }
  settingsView(): SettingsView {
    const { apiKey, ...view } = this.settings();
    return { ...view, hasApiKey: Boolean(apiKey) };
  }
  close() { this.db.close(); }
}
