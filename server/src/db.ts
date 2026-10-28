import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  SeedSourceSchema, SettingsSchema, COUNTRY_CODES,
  type CountryCode, type Settings, type SeedSource, type TickerItem,
} from '@ticker/shared';

export type DB = Database.Database;
export type SourceRow = {
  id: string; country: CountryCode; name: string; type: 'google_news' | 'rss';
  feeds: Record<string, string | string[]>; position: number; enabled: boolean;
  status: 'ok' | 'warn' | 'error' | 'unknown'; checkedAt: string | null; message: string | null;
};

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, country TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      feeds TEXT NOT NULL, position INTEGER NOT NULL, enabled INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown', checked_at TEXT, message TEXT
    );
    CREATE TABLE IF NOT EXISTS ticker_cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, body TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', seen_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS detail_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS llm_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
  `);
  return db;
}

/** Legt fehlende Quellen aus dem Seed an (auch bei bestehender DB, z. B. neues Land); vorhandene bleiben unberührt. */
export function seedIfEmpty(db: DB, seedPath: string): void {
  const seeds = z.array(SeedSourceSchema).parse(JSON.parse(readFileSync(seedPath, 'utf8')));
  seedSources(db, seeds);
}

export function seedSources(db: DB, seeds: SeedSource[]): void {
  const ins = db.prepare('INSERT OR IGNORE INTO sources (id,country,name,type,feeds,position,enabled) VALUES (?,?,?,?,?,?,?)');
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) m FROM sources WHERE country=?');
  const exists = db.prepare('SELECT 1 FROM sources WHERE id=?');
  const pos: Record<string, number> = {};
  db.transaction(() => {
    for (const s of seeds) {
      if (exists.get(s.id)) continue;
      pos[s.country] ??= (maxPos.get(s.country) as { m: number }).m + 1;
      ins.run(s.id, s.country, s.name, s.type, JSON.stringify(s.feeds), pos[s.country]++, s.defaultEnabled ? 1 : 0);
    }
  })();
  if (!db.prepare("SELECT 1 FROM kv WHERE k='settings'").get()) {
    const defaults = { activeCountries: ['jp', 'us', 'de'], itemCount: 12, summaryLength: 'medium', defaultCategory: 'top' };
    db.prepare("INSERT INTO kv (k,v) VALUES ('settings',?)").run(JSON.stringify(defaults));
  }
}

const rowToSource = (r: any): SourceRow => ({
  id: r.id, country: r.country, name: r.name, type: r.type, feeds: JSON.parse(r.feeds),
  position: r.position, enabled: !!r.enabled, status: r.status, checkedAt: r.checked_at, message: r.message,
});

export function listSources(db: DB, country?: CountryCode): SourceRow[] {
  const rows = country
    ? db.prepare('SELECT * FROM sources WHERE country=? ORDER BY position').all(country)
    : db.prepare('SELECT * FROM sources ORDER BY country, position').all();
  return rows.map(rowToSource);
}

export function getSettings(db: DB): Settings {
  const raw = JSON.parse((db.prepare("SELECT v FROM kv WHERE k='settings'").get() as { v: string }).v);
  const sources = {} as Settings['sources'];
  for (const c of COUNTRY_CODES) sources[c] = listSources(db, c).map((s) => ({ id: s.id, enabled: s.enabled }));
  return SettingsSchema.parse({ ...raw, sources });
}

export function saveSettings(db: DB, s: Settings): void {
  db.transaction(() => {
    const { sources, ...rest } = s;
    db.prepare("INSERT INTO kv (k,v) VALUES ('settings',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(JSON.stringify(rest));
    const upd = db.prepare('UPDATE sources SET position=?, enabled=? WHERE id=? AND country=?');
    for (const c of COUNTRY_CODES) {
      (sources[c] ?? []).forEach((src, i) => upd.run(i, src.enabled ? 1 : 0, src.id, c));
    }
  })();
}

export function setSourceStatus(db: DB, id: string, status: SourceRow['status'], message: string | null): void {
  db.prepare('UPDATE sources SET status=?, message=?, checked_at=? WHERE id=?').run(status, message, new Date().toISOString(), id);
}

export function saveItems(db: DB, items: { item: TickerItem; description: string }[]): void {
  const st = db.prepare('INSERT INTO items (id,body,description,seen_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, description=excluded.description, seen_at=excluded.seen_at');
  db.transaction(() => { for (const { item, description } of items) st.run(item.id, JSON.stringify(item), description, Date.now()); })();
}
export function getItem(db: DB, id: string): { item: TickerItem; description: string } | null {
  const r = db.prepare('SELECT body, description FROM items WHERE id=?').get(id) as { body: string; description: string } | undefined;
  return r ? { item: JSON.parse(r.body), description: r.description } : null;
}

export function getCached(db: DB, key: string): { fetchedAt: number; body: string } | null {
  const r = db.prepare('SELECT fetched_at, body FROM ticker_cache WHERE key=?').get(key) as { fetched_at: number; body: string } | undefined;
  return r ? { fetchedAt: r.fetched_at, body: r.body } : null;
}
export function putCached(db: DB, key: string, body: string): void {
  db.prepare('INSERT INTO ticker_cache (key,fetched_at,body) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at, body=excluded.body').run(key, Date.now(), body);
}
export function getDetailCache(db: DB, key: string): string | null {
  return (db.prepare('SELECT body FROM detail_cache WHERE key=?').get(key) as { body: string } | undefined)?.body ?? null;
}
export function putDetailCache(db: DB, key: string, body: string): void {
  db.prepare('INSERT OR REPLACE INTO detail_cache (key,body,created_at) VALUES (?,?,?)').run(key, body, Date.now());
}

/** Zählt einen LLM-Aufruf; false, wenn das Tageslimit erreicht ist. */
export function takeLlmCall(db: DB, max: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  return db.transaction(() => {
    const r = db.prepare('SELECT calls FROM llm_usage WHERE day=?').get(day) as { calls: number } | undefined;
    if ((r?.calls ?? 0) >= max) return false;
    db.prepare('INSERT INTO llm_usage (day,calls) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET calls=calls+1').run(day);
    return true;
  })();
}
