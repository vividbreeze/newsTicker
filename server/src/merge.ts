import type { FeedEntry } from './feeds.js';

export type SourceEntries = { sourceId: string; sourceName: string; entries: FeedEntry[] };
export type Merged = FeedEntry & { sourceId: string; sourceName: string; isTop: boolean; rank: number };

/** Entfernt Einträge, die älter als maxAgeHours sind (Einträge ohne Datum bleiben). */
export function filterByAge(entries: FeedEntry[], maxAgeHours: number, now = Date.now()): FeedEntry[] {
  const limit = now - maxAgeHours * 3600_000;
  return entries.filter((e) => !e.publishedAt || new Date(e.publishedAt).getTime() >= limit);
}

/** Reißverschluss: Platz 1 jeder Quelle, dann Platz 2 usw.; Reihenfolge der Quellen bleibt erhalten. */
export function zipperMerge(sources: SourceEntries[], limit: number): Merged[] {
  const out: Merged[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...sources.map((s) => s.entries.length));
  for (let i = 0; i < max && out.length < limit; i++) {
    for (const s of sources) {
      const e = s.entries[i];
      if (!e || seen.has(e.url)) continue;
      seen.add(e.url);
      out.push({ ...e, sourceId: s.sourceId, sourceName: e.sourceName || s.sourceName, isTop: i === 0, rank: 0 });
      if (out.length >= limit) break;
    }
  }
  return out.map((m, i) => ({ ...m, rank: i + 1 }));
}

/** Platzhalter für eine spätere Duplikat-Erkennung zwischen Merge und LLM. */
export type DedupeStep = (items: Merged[]) => Merged[];
export const noDedupe: DedupeStep = (items) => items;

/** Anzeige chronologisch (neueste zuerst); Auswahl/Top-Markierung stammen aus dem Reißverschluss. Rang = Anzeigeposition. */
export function sortByTime(items: Merged[], now = Date.now()): Merged[] {
  const t = (m: Merged) => (m.publishedAt ? Date.parse(m.publishedAt) : now);
  return [...items].sort((a, b) => t(b) - t(a)).map((m, i) => ({ ...m, rank: i + 1 }));
}
