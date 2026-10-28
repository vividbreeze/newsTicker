import { createHash } from 'node:crypto';
import {
  COUNTRIES, TickerResponseSchema, TickerDetailSchema,
  type CountryCode, type SummaryLength, type TickerResponse, type TickerDetail, type TickerItem, type Settings,
} from '@ticker/shared';
import type { Config } from './config.js';
import * as store from './db.js';
import type { DB } from './db.js';
import { fetchFeed, itemId, splitGoogleTitle, type FetchFn, type FeedEntry } from './feeds.js';
import { filterByAge, zipperMerge, sortByTime, noDedupe, type SourceEntries, type DedupeStep } from './merge.js';
import { translateBatch, summarizeBatch, summarizeArticle, summarizeShort, type Llm } from './llm.js';
import { fetchArticleText } from './article.js';

export type Deps = { cfg: Config; db: DB; llm: Llm; fetch: FetchFn; dedupe?: DedupeStep; now?: () => number };

export function cacheKey(country: string, category: string, sourceIds: string[], s: Pick<Settings, 'itemCount' | 'summaryLength'>): string {
  return createHash('sha1').update([country, category, sourceIds.join(','), s.itemCount, s.summaryLength].join('|')).digest('hex');
}

const inflight = new Map<string, Promise<TickerResponse>>();
const prefetchFailed = new Set<string>(); // kein Artikeltext/Fehler: nicht bei jedem Abruf neu versuchen
const prefetchJobs = new Map<string, Promise<void>>(); // itemId|length -> laufender Vorabruf
const CHUNK = 2; // kleine Chunks: kürzere Wartezeit pro Meldung, mehr parallele Aufrufe

type PrefetchItem = { id: string; title: string; url: string; sourceName: string };

function startPrefetch(d: Deps, items: PrefetchItem[], lang: string, length: SummaryLength): void {
  const todo = items.filter((i) => !store.getDetailCache(d.db, `${i.id}|${length}`) && !prefetchJobs.has(`${i.id}|${length}`) && !prefetchFailed.has(`${i.id}|${length}`));
  if (todo.length === 0) return;
  // Artikel parallel holen; danach in kleinen Chunks parallel zusammenfassen (kürzere Wartezeit als ein Riesen-Aufruf).
  const texts = Promise.all(todo.map((i) => fetchArticleText(i.url, d.cfg, d.fetch).catch(() => null)));
  const chunks: PrefetchItem[][] = [];
  for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));
  const run = async (chunk: PrefetchItem[]) => {
    const all = await texts;
    const withText = chunk.map((i) => ({ ...i, text: all[todo.indexOf(i)]?.text })).filter((i): i is PrefetchItem & { text: string } => !!i.text);
    for (const i of chunk) if (!withText.some((w) => w.id === i.id)) prefetchFailed.add(`${i.id}|${length}`);
    if (withText.length === 0) return;
    const sums = await summarizeBatch(d.llm, withText, lang, length);
    for (const i of withText) {
      const summary = sums.get(i.id);
      if (!summary) prefetchFailed.add(`${i.id}|${length}`);
      if (summary) store.putDetailCache(d.db, `${i.id}|${length}`, JSON.stringify({ id: i.id, summary, limited: false, url: i.url, sourceName: i.sourceName }));
    }
  };
  for (const chunk of chunks) {
    const job = run(chunk).catch((e) => console.error('Vorabruf fehlgeschlagen:', e instanceof Error ? e.message : e)).finally(() => { for (const i of chunk) prefetchJobs.delete(`${i.id}|${length}`); });
    for (const i of chunk) prefetchJobs.set(`${i.id}|${length}`, job);
  }
}

export function getTicker(d: Deps, country: CountryCode, category: string, refresh: boolean): Promise<TickerResponse> {
  const settings = store.getSettings(d.db);
  const sources = store.listSources(d.db, country).filter((s) => s.enabled && s.feeds[category]);
  const key = cacheKey(country, category, sources.map((s) => s.id), settings);
  const now = (d.now ?? Date.now)();
  const cached = store.getCached(d.db, key);
  if (cached && !refresh && now - cached.fetchedAt < d.cfg.cacheTtlMinutes * 60_000) {
    const hit = TickerResponseSchema.parse(JSON.parse(cached.body));
    // Fehlende Details (z. B. nach Neustart) im Hintergrund nachholen.
    if (d.cfg.prefetchDetails) startPrefetch(d, hit.items.map((i) => ({ id: i.id, title: i.originalTitle, url: i.url, sourceName: i.sourceName })), COUNTRIES[country].lang, settings.summaryLength);
    return Promise.resolve(hit);
  }
  let p = inflight.get(key);
  if (!p) {
    p = build(d, country, category, key, settings, sources, cached?.body ?? null).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function build(d: Deps, country: CountryCode, category: string, key: string, settings: Settings, sources: store.SourceRow[], stale: string | null): Promise<TickerResponse> {
  const t0 = Date.now();
  const sourceErrors: TickerResponse['sourceErrors'] = [];
  const results = await Promise.all(sources.map(async (s): Promise<SourceEntries | null> => {
    try {
      const { entries } = await fetchFeed(s.feeds[category], d.cfg, d.fetch);
      const mapped: FeedEntry[] = entries.map((e) => {
        if (s.type !== 'google_news') return e;
        const sp = splitGoogleTitle(e.title, e.sourceName);
        // Google-Beschreibungen sind nur Link-Listen verwandter Artikel.
        return { ...e, title: sp.title, sourceName: sp.sourceName, description: '' };
      });
      return { sourceId: s.id, sourceName: s.name, entries: filterByAge(mapped, d.cfg.maxAgeHours, (d.now ?? Date.now)()) };
    } catch (e) {
      sourceErrors.push({ sourceId: s.id, message: e instanceof Error ? e.message : 'Fehler' });
      return null;
    }
  }));
  const ok = results.filter((r): r is SourceEntries => r !== null);
  const tFeeds = Date.now() - t0;

  if (ok.length === 0 || ok.every((r) => r.entries.length === 0) && sourceErrors.length > 0) {
    if (stale) return { ...TickerResponseSchema.parse(JSON.parse(stale)), stale: true, sourceErrors };
    if (sources.length === 0) return { country, category, fetchedAt: new Date().toISOString(), stale: false, items: [], sourceErrors };
    throw new Error('Alle Quellen nicht erreichbar');
  }

  const merged = sortByTime((d.dedupe ?? noDedupe)(zipperMerge(ok, settings.itemCount)), (d.now ?? Date.now)());
  const lang = COUNTRIES[country].lang;
  let notice: string | undefined;
  let tr: Map<string, { title: string; teaser: string }> | null = null;
  if (merged.length > 0) {
    try {
      const out = await translateBatch(d.llm, merged.map((m) => ({ id: itemId(m.url), title: m.title, description: m.description })), lang, settings.summaryLength);
      tr = new Map(out.map((o) => [o.id, o]));
    } catch (e) {
      notice = `Übersetzung nicht verfügbar (${e instanceof Error ? e.message.slice(0, 120) : 'Fehler'}) – Originaltexte werden angezeigt.`;
      console.error('LLM-Batch fehlgeschlagen:', e instanceof Error ? e.message : e);
    }
  }
  console.log(`[ticker] ${country}/${category}: Feeds ${tFeeds} ms, LLM ${Date.now() - t0 - tFeeds} ms, ${merged.length} Meldungen`);
  const stored: { item: TickerItem; description: string }[] = [];
  const items: TickerItem[] = merged.map((m) => {
    const id = itemId(m.url);
    const t = tr?.get(id);
    const item: TickerItem = {
      id, publishedAt: m.publishedAt ?? new Date((d.now ?? Date.now)()).toISOString(), rank: m.rank, isTop: m.isTop,
      title: t?.title ?? m.title, teaser: t?.teaser ?? m.description.slice(0, 200),
      originalTitle: m.title, sourceId: m.sourceId, sourceName: m.sourceName, url: m.url,
    };
    stored.push({ item, description: m.description });
    return item;
  });
  const resp: TickerResponse = { country, category, fetchedAt: new Date((d.now ?? Date.now)()).toISOString(), stale: false, items, sourceErrors, ...(notice ? { notice } : {}) };
  store.saveItems(d.db, stored);
  // Ohne Übersetzung nicht lange cachen: nächster Abruf versucht es erneut.
  if (!notice) store.putCached(d.db, key, JSON.stringify(resp));
  // Details im Hintergrund vorbereiten: die Liste erscheint sofort, „Mehr" ist meist schon fertig.
  if (!notice && d.cfg.prefetchDetails) startPrefetch(d, merged.map((m) => ({ id: itemId(m.url), title: m.title, url: m.url, sourceName: m.sourceName })), lang, settings.summaryLength);
  return resp;
}

export async function getDetail(d: Deps, id: string): Promise<TickerDetail | null> {
  const found = store.getItem(d.db, id);
  if (!found) return null;
  const { item, description } = found;
  const settings = store.getSettings(d.db);
  const key = `${id}|${settings.summaryLength}`;
  let hit = store.getDetailCache(d.db, key);
  if (!hit && prefetchJobs.has(key)) { await prefetchJobs.get(key); hit = store.getDetailCache(d.db, key); } // läuft schon: abwarten statt doppelt holen
  if (hit) return TickerDetailSchema.parse(JSON.parse(hit));

  const country = (store.listSources(d.db).find((s) => s.id === item.sourceId)?.country ?? 'us') as CountryCode;
  const lang = COUNTRIES[country].lang;
  // sourceId des Items ist die Quelle (z. B. google-jp); Sprache richtet sich nach deren Land.
  let summary: string | null = null;
  let limited = false;
  let cacheable = true;
  const article = await fetchArticleText(item.url, d.cfg, d.fetch);
  try {
    if (article) summary = await summarizeArticle(d.llm, { title: item.originalTitle, text: article.text, lang, length: settings.summaryLength });
  } catch { cacheable = false; }
  if (!summary) {
    limited = true;
    try {
      summary = await summarizeShort(d.llm, { title: item.originalTitle, description, lang, length: settings.summaryLength });
    } catch {
      cacheable = false;
      summary = [item.title, item.teaser].filter(Boolean).join('. ');
    }
  }
  const out: TickerDetail = { id, summary, limited, url: item.url, sourceName: item.sourceName };
  if (cacheable) store.putDetailCache(d.db, key, JSON.stringify(out));
  return out;
}
