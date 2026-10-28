import { CATEGORIES } from '@ticker/shared';
import type { Config } from './config.js';
import { listSources, setSourceStatus, type DB } from './db.js';
import { fetchFeed, type FetchFn } from './feeds.js';

/** Prüft alle Feeds; defekte werden nur markiert (ok / warn = leer oder veraltet / error). */
export async function checkAllFeeds(db: DB, cfg: Config, f: FetchFn = fetch): Promise<void> {
  for (const s of listSources(db)) {
    const cats = Object.keys(s.feeds);
    const results = await Promise.all(cats.map(async (c) => {
      try {
        const { entries } = await fetchFeed(s.feeds[c], cfg, f);
        const newest = Math.max(0, ...entries.map((e) => (e.publishedAt ? Date.parse(e.publishedAt) : 0)));
        return { c, ok: true as const, n: entries.length, newest };
      } catch (e) { return { c, ok: false as const, msg: e instanceof Error ? e.message : 'Fehler' }; }
    }));
    const bad = results.filter((r) => !r.ok);
    const stale = results.filter((r) => r.ok && (r.n === 0 || (r.newest > 0 && Date.now() - r.newest > 7 * 86400_000)));
    const label = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? k;
    if (bad.length === 0 && stale.length === 0) setSourceStatus(db, s.id, 'ok', null);
    else if (bad.length === results.length) setSourceStatus(db, s.id, 'error', `Alle Feeds fehlgeschlagen (${(bad[0] as any).msg})`);
    else setSourceStatus(db, s.id, 'warn', [...bad.map((b) => `${label(b.c)}: Fehler`), ...stale.map((b) => `${label(b.c)}: leer/veraltet`)].join(', '));
  }
}

export function scheduleDailyCheck(db: DB, cfg: Config): NodeJS.Timeout {
  const run = () => checkAllFeeds(db, cfg).catch((e) => console.error('Feed-Prüfung fehlgeschlagen', e instanceof Error ? e.message : e));
  setTimeout(run, 15_000).unref();
  const t = setInterval(run, 24 * 3600_000);
  t.unref();
  return t;
}
