import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { isIP } from 'node:net';
import type { Config } from './config.js';
import type { FetchFn } from './feeds.js';

type Cfg = Pick<Config, 'feedTimeoutMs' | 'userAgent'>;

function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(h) === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}

/** Folgt Redirects manuell und prüft jeden Hop (kein Zugriff aufs interne Netz). */
export async function safeGet(url: string, cfg: Cfg, f: FetchFn = fetch, maxHops = 6): Promise<{ body: string; finalUrl: string; type: string }> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    const u = new URL(current);
    if (!/^https?:$/.test(u.protocol) || isPrivateHost(u.hostname)) throw new Error('URL nicht erlaubt');
    const res = await f(current, {
      redirect: 'manual', signal: AbortSignal.timeout(cfg.feedTimeoutMs),
      headers: { 'User-Agent': cfg.userAgent, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en,de,ja' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = (await res.text()).slice(0, 2_000_000);
    return { body: buf, finalUrl: current, type: res.headers.get('content-type') ?? '' };
  }
  throw new Error('Zu viele Weiterleitungen');
}

const isGoogleNews = (u: string) => { try { return new URL(u).hostname === 'news.google.com'; } catch { return false; } };

/** Versucht die echte Artikel-URL hinter einem Google-News-Link zu finden; sonst null. */
export async function resolveGoogleUrl(url: string, cfg: Cfg, f: FetchFn = fetch): Promise<string | null> {
  if (!isGoogleNews(url)) return url;
  const id = url.match(/\/articles\/([^/?]+)/)?.[1];
  if (id) {
    try {
      const bin = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
      const m = bin.match(/https?:\/\/[\x21-\x7e]+/);
      if (m && !isGoogleNews(m[0])) return m[0];
    } catch { /* weiter */ }
  }
  try {
    const { body, finalUrl } = await safeGet(url, cfg, f);
    if (!isGoogleNews(finalUrl)) return finalUrl;
    const sg = body.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = body.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (id && sg && ts) {
      const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
      const res = await f('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
        method: 'POST', signal: AbortSignal.timeout(cfg.feedTimeoutMs),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': cfg.userAgent },
        body: new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', inner, null, 'generic']]]) }).toString(),
      });
      const m = (await res.text()).match(/garturlres\\",\\"(https?:[^"\\]+)/);
      if (m && !isGoogleNews(m[1])) return m[1];
    }
    const cand = body.match(/data-n-au="([^"]+)"/)?.[1]
      ?? body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
      ?? body.match(/http-equiv="refresh"[^>]+url=([^"']+)/i)?.[1];
    if (cand) {
      const dec = cand.replace(/&amp;/g, '&');
      if (!isGoogleNews(dec)) return dec;
    }
  } catch { /* Fallback */ }
  return null;
}

export type Article = { text: string; url: string };

export async function fetchArticleText(url: string, cfg: Cfg, f: FetchFn = fetch): Promise<Article | null> {
  const real = await resolveGoogleUrl(url, cfg, f);
  if (!real) return null;
  try {
    const { body, finalUrl, type } = await safeGet(real, cfg, f);
    if (type && !/html|xml/i.test(type)) return null;
    const dom = new JSDOM(body, { url: finalUrl, virtualConsole: new VirtualConsole() });
    const art = new Readability(dom.window.document).parse();
    const text = (art?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length >= 150 ? { text: text.slice(0, 15000), url: finalUrl } : null;
  } catch { return null; }
}
