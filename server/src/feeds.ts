import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import type { Config } from './config.js';

export type FetchFn = typeof fetch;
export type FeedEntry = {
  title: string; url: string; description: string; publishedAt: string | null; sourceName: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text',
  processEntities: true, htmlEntities: true, trimValues: true,
});

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function text(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function toIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function atomLink(l: any): string {
  const links = arr(l);
  const alt = links.find((x: any) => !x['@_rel'] || x['@_rel'] === 'alternate') ?? links[0];
  return alt ? (typeof alt === 'string' ? alt : alt['@_href'] ?? text(alt)) : '';
}

/** Parst RSS 2.0, RDF/RSS 1.0 und Atom. */
export function parseFeed(xml: string): FeedEntry[] {
  const doc = parser.parse(xml);
  let raw: any[] = [];
  let kind: 'rss' | 'rdf' | 'atom';
  if (doc.rss) { raw = arr(doc.rss.channel?.item ?? doc.rss.channel?.[0]?.item); kind = 'rss'; }
  else if (doc['rdf:RDF']) { raw = arr(doc['rdf:RDF'].item); kind = 'rdf'; }
  else if (doc.feed) { raw = arr(doc.feed.entry); kind = 'atom'; }
  else throw new Error('Kein RSS/RDF/Atom-Feed');

  const out: FeedEntry[] = [];
  for (const it of raw) {
    const title = stripHtml(text(it.title));
    const url = (kind === 'atom' ? atomLink(it.link) : text(it.link) || text(it.guid)).trim();
    if (!title || !url) continue;
    const desc = kind === 'atom' ? text(it.summary) || text(it.content) : text(it.description) || text(it['content:encoded']);
    const date = kind === 'atom' ? text(it.published) || text(it.updated) : text(it.pubDate) || text(it['dc:date']);
    const src = kind === 'rss' ? text(it.source) : '';
    out.push({ title, url, description: stripHtml(desc), publishedAt: toIso(date), sourceName: src || null });
  }
  return out;
}

/** Google News: Quelle steht im <source>-Element bzw. am Titelende („… - NHK“). */
export function splitGoogleTitle(title: string, sourceName: string | null): { title: string; sourceName: string | null } {
  const m = title.match(/^(.*\S)\s+[-–—]\s+([^-–—]+)$/);
  if (sourceName) {
    const suffix = ` - ${sourceName}`;
    return { title: title.endsWith(suffix) ? title.slice(0, -suffix.length) : m && m[2].trim() === sourceName ? m[1] : title, sourceName };
  }
  return m ? { title: m[1], sourceName: m[2].trim() } : { title, sourceName: null };
}

export const itemId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16);

export async function fetchText(url: string, cfg: Pick<Config, 'feedTimeoutMs' | 'userAgent'>, f: FetchFn = fetch): Promise<{ text: string; status: number; finalUrl: string; redirected: boolean }> {
  const res = await f(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(cfg.feedTimeoutMs),
    headers: { 'User-Agent': cfg.userAgent, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), status: res.status, finalUrl: res.url || url, redirected: res.redirected };
}

/** Probiert mehrere URLs nacheinander; die erste funktionierende zählt. */
export async function fetchFeed(urls: string | string[], cfg: Pick<Config, 'feedTimeoutMs' | 'userAgent'>, f: FetchFn = fetch): Promise<{ entries: FeedEntry[]; url: string }> {
  let lastErr: unknown;
  for (const url of arr(urls)) {
    try {
      const { text: body } = await fetchText(url, cfg, f);
      const entries = parseFeed(body);
      return { entries, url };
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Feed nicht abrufbar');
}
