import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { openDb, seedSources } from '../src/db.js';
import type { Llm } from '../src/llm.js';
import type { Deps } from '../src/ticker.js';
import type { SeedSource } from '@ticker/shared';

export const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
export const TOKEN = 'test-token-0123456789abcdef';

export const SEED: SeedSource[] = [
  { id: 'google-jp', country: 'jp', name: 'Google News Japan', type: 'google_news', feeds: { top: 'https://g.test/top' }, defaultEnabled: true },
  { id: 'asahi', country: 'jp', name: 'Asahi', type: 'rss', feeds: { top: 'https://asahi.test/rdf' }, defaultEnabled: true },
  { id: 'tagesschau', country: 'de', name: 'tagesschau', type: 'rss', feeds: { top: 'https://ts.test/rss' }, defaultEnabled: true },
  { id: 'nyt', country: 'us', name: 'NYT', type: 'rss', feeds: { top: 'https://nyt.test/rss' }, defaultEnabled: true },
  { id: 'bbc', country: 'gb', name: 'BBC', type: 'rss', feeds: { top: 'https://bbc.test/rss' }, defaultEnabled: true },
];

export function mockFetch(map: Record<string, string | number>) {
  const calls: string[] = [];
  const fn = (async (url: any) => {
    const u = String(url); calls.push(u);
    const v = map[u];
    if (v === undefined) return new Response('nf', { status: 404 });
    if (typeof v === 'number') return new Response('err', { status: v });
    return new Response(v, { status: 200, headers: { 'content-type': 'text/xml' } });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

/** LLM-Mock: gibt für jede Eingabe-ID einen übersetzten Eintrag zurück. */
export function mockLlm(): Llm & { calls: number } {
  const m = {
    calls: 0,
    async complete(_s: string, user: string) {
      m.calls++;
      const parsed = JSON.parse(user);
      if (parsed.items) return JSON.stringify({ items: parsed.items.map((i: any) => ({ id: i.id, title: `DE: ${i.title}`, teaser: `Teaser ${i.id}`, summary: i.text ? `Zusammenfassung: ${i.title}` : null })) });
      return JSON.stringify({ summary: `Zusammenfassung: ${parsed.title}` });
    },
  };
  return m;
}

export function makeDeps(fetchMap: Record<string, string | number>, llm: Llm = mockLlm(), over: Partial<Deps['cfg']> = {}) {
  const cfg = { ...loadConfig({ API_TOKEN: TOKEN } as any), webDir: '/nonexistent', ...over };
  const db = openDb(':memory:');
  seedSources(db, SEED);
  const f = mockFetch(fetchMap);
  const deps: Deps = { cfg, db, llm, fetch: f };
  return { deps, db, fetch: f, llm };
}
