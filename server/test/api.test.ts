import { describe, it, expect } from 'vitest';
import { buildApp, tokenValid } from '../src/app.js';
import { makeDeps, fx, TOKEN } from './helpers.js';
import { getSettings } from '../src/db.js';

const auth = { authorization: `Bearer ${TOKEN}` };
async function setup() {
  const { deps, db } = makeDeps({ 'https://g.test/top': fx('google.xml'), 'https://asahi.test/rdf': fx('rdf.xml') });
  return { app: await buildApp(deps), db };
}

describe('Auth', () => {
  it('tokenValid', () => {
    expect(tokenValid(TOKEN, TOKEN)).toBe(true);
    expect(tokenValid('x', TOKEN)).toBe(false);
    expect(tokenValid(undefined, TOKEN)).toBe(false);
    expect(tokenValid('', '')).toBe(false);
  });
  it('401 ohne/mit falschem Token auf allen /api-Endpunkten, auch unbekannten', async () => {
    const { app } = await setup();
    for (const url of ['/api/meta', '/api/settings', '/api/sources', '/api/ticker?country=jp&category=top', '/api/ticker/abcdef0123456789/detail', '/api/nope']) {
      for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: TOKEN }]) {
        const r = await app.inject({ url, headers });
        expect(r.statusCode, url).toBe(401);
        expect(r.body).toBe('');
      }
    }
    expect((await app.inject({ method: 'PUT', url: '/api/settings', payload: {} })).statusCode).toBe(401);
  });
  it('/healthz ohne Auth', async () => {
    const { app } = await setup();
    const r = await app.inject('/healthz');
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('ok');
  });
});

describe('API', () => {
  it('meta, ticker, detail', async () => {
    const { app } = await setup();
    const meta = await app.inject({ url: '/api/meta', headers: auth });
    expect(meta.json().categories).toHaveLength(8);
    const t = await app.inject({ url: '/api/ticker?country=jp&category=top', headers: auth });
    expect(t.statusCode).toBe(200);
    const body = t.json();
    expect(body.items.length).toBeGreaterThan(0);
    const d = await app.inject({ url: `/api/ticker/${body.items[0].id}/detail`, headers: auth });
    expect(d.statusCode).toBe(200);
    expect(d.json().url).toBe(body.items[0].url);
  });
  it('validiert Parameter und aktive Länder', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/ticker?country=xx&category=top', headers: auth })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/ticker?country=gb&category=top', headers: auth })).statusCode).toBe(400); // gb nicht aktiv (Default jp,us,de)
    expect((await app.inject({ url: '/api/ticker/zzz/detail', headers: auth })).statusCode).toBe(400);
  });
  it('Settings: speichern, validieren (genau 3 Länder)', async () => {
    const { app, db } = await setup();
    const cur = getSettings(db);
    const ok = await app.inject({ method: 'PUT', url: '/api/settings', headers: auth, payload: { ...cur, itemCount: 7, summaryLength: 'long', sources: { ...cur.sources, jp: [{ id: 'asahi', enabled: true }, { id: 'google-jp', enabled: false }] } } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().sources.jp[0]).toEqual({ id: 'asahi', enabled: true });
    expect(getSettings(db).itemCount).toBe(7);
    const bad = await app.inject({ method: 'PUT', url: '/api/settings', headers: auth, payload: { ...cur, activeCountries: ['jp', 'us'] } });
    expect(bad.statusCode).toBe(400);
    const bad2 = await app.inject({ method: 'PUT', url: '/api/settings', headers: auth, payload: { ...cur, sources: { ...cur.sources, jp: [{ id: 'nyt', enabled: true }] } } });
    expect(bad2.statusCode).toBe(400);
  });
  it('sources liefert Status und Kategorien', async () => {
    const { app } = await setup();
    const r = await app.inject({ url: '/api/sources?country=jp', headers: auth });
    expect(r.json()).toHaveLength(2);
    expect(r.json()[0]).toMatchObject({ id: 'google-jp', status: 'unknown', categories: ['top'] });
  });
  it('Rate-Limit greift', async () => {
    const { deps } = makeDeps({}, undefined, { rateLimitPerMinute: 3 });
    const app = await buildApp(deps);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await app.inject({ url: '/api/meta', headers: auth })).statusCode);
    expect(codes).toContain(429);
  });
});
