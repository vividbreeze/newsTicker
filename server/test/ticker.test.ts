import { describe, it, expect } from 'vitest';
import { makeDeps, mockLlm, fx } from './helpers.js';
import { getTicker, getDetail } from '../src/ticker.js';
import { getSettings, saveSettings } from '../src/db.js';

const now = () => Date.parse('2026-10-28T12:00:00Z');
const feeds = { 'https://g.test/top': fx('google.xml'), 'https://asahi.test/rdf': fx('rdf.xml') };

describe('getTicker', () => {
  it('holt, mischt und übersetzt in einem LLM-Aufruf', async () => {
    const llm = mockLlm();
    const { deps } = makeDeps(feeds, llm);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    expect(llm.calls).toBe(1);
    expect(r.items.map((i) => i.sourceId)).toEqual(['google-jp', 'asahi', 'google-jp']);
    expect(r.items[0]).toMatchObject({ rank: 1, isTop: true, sourceName: 'NHK', originalTitle: '台風が接近', title: 'DE: 台風が接近' });
    expect(r.items[1].isTop).toBe(true);
    expect(r.stale).toBe(false);
  });

  it('liefert innerhalb der TTL aus dem Cache, mit refresh neu', async () => {
    const llm = mockLlm();
    const { deps, fetch } = makeDeps(feeds, llm);
    deps.now = now;
    await getTicker(deps, 'jp', 'top', false);
    const n = fetch.calls.length;
    await getTicker(deps, 'jp', 'top', false);
    expect(fetch.calls.length).toBe(n);
    await getTicker(deps, 'jp', 'top', true);
    expect(fetch.calls.length).toBe(n * 2);
  });

  it('Einstellungen ändern den Cache-Key (summaryLength)', async () => {
    const llm = mockLlm();
    const { deps, db } = makeDeps(feeds, llm);
    deps.now = now;
    await getTicker(deps, 'jp', 'top', false);
    saveSettings(db, { ...getSettings(db), summaryLength: 'long' });
    await getTicker(deps, 'jp', 'top', false);
    expect(llm.calls).toBe(2);
  });

  it('Ausfall einer Quelle: übrige Meldungen plus sourceErrors', async () => {
    const { deps } = makeDeps({ 'https://g.test/top': fx('google.xml'), 'https://asahi.test/rdf': 500 });
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    expect(r.items.length).toBe(2);
    expect(r.sourceErrors).toEqual([{ sourceId: 'asahi', message: 'HTTP 500' }]);
  });

  it('Totalausfall: stale-Cache bzw. Fehler', async () => {
    const { deps, fetch } = makeDeps(feeds);
    deps.now = now;
    await expect(getTicker(makeDeps({}).deps, 'jp', 'top', true)).rejects.toThrow();
    await getTicker(deps, 'jp', 'top', false);
    const down = makeDeps({});
    down.deps.db = deps.db; down.deps.fetch = down.fetch;
    const r = await getTicker(down.deps, 'jp', 'top', true);
    expect(r.stale).toBe(true);
    expect(r.items.length).toBe(3);
    expect(fetch.calls.length).toBeGreaterThan(0);
  });

  it('LLM-Fehler: Originaltexte mit Hinweis, nicht gecacht', async () => {
    const bad = { async complete() { return 'kein json'; } };
    const { deps } = makeDeps(feeds, bad);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    expect(r.notice).toMatch(/Originaltexte/);
    expect(r.items[0].title).toBe('台風が接近');
  });

  it('LLM: bei Parse-Fehler einmal wiederholen', async () => {
    let n = 0;
    const inner = mockLlm();
    const flaky = { async complete(s: string, u: string, m: number) { return n++ === 0 ? "{kaputt" : inner.complete(s, u, m); } };
    const { deps } = makeDeps(feeds, flaky);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    expect(n).toBe(2);
    expect(r.notice).toBeUndefined();
  });
});

describe('getDetail', () => {
  it('Fallback auf Kurzfassung (limited), Link bleibt', async () => {
    const llm = mockLlm();
    const { deps } = makeDeps(feeds, llm);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    const d = await getDetail(deps, r.items[1].id);
    expect(d).toMatchObject({ limited: true, url: 'https://jp.ex/1', sourceName: 'Asahi' });
    expect(d!.summary).toContain('Zusammenfassung');
  });
  it('unbekannte ID → null', async () => {
    expect(await getDetail(makeDeps({}).deps, 'abcdef0123456789')).toBeNull();
  });
  it('voller Artikel: Detail kommt aus dem Batch, kein weiterer Abruf/LLM-Aufruf', async () => {
    const body = '<html><head><title>x</title></head><body><article><p>' + 'Satz über den Sachverhalt. '.repeat(40) + '</p></article></body></html>';
    const llm = mockLlm();
    const { deps, fetch } = makeDeps({ ...feeds, 'https://jp.ex/1': body }, llm);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    // Liste = 1 LLM-Aufruf; Details laufen im Hintergrund, getDetail wartet darauf statt neu zu holen
    expect(llm.calls).toBe(1);
    const d = await getDetail(deps, r.items[1].id);
    expect(d).toMatchObject({ limited: false, summary: 'Zusammenfassung: 首相が会見' });
    const after = llm.calls;
    await getDetail(deps, r.items[1].id);
    expect(llm.calls).toBe(after);
    expect(fetch.calls.filter((u) => u === 'https://jp.ex/1')).toHaveLength(1);
  });
});

describe('Batch-Robustheit', () => {
  it('akzeptiert null als teaser/summary', async () => {
    const nulls = { async complete(_s: string, u: string) { return JSON.stringify({ items: JSON.parse(u).items.map((i: any) => ({ id: i.id, title: 'T', teaser: null })) }); } };
    const { deps } = makeDeps(feeds, nulls);
    deps.now = now;
    const r = await getTicker(deps, 'jp', 'top', false);
    expect(r.notice).toBeUndefined();
    expect(r.items[0].title).toBe('T');
  });
});
