import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { timingSafeEqual, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  CountrySchema, CategorySchema, SettingsSchema, COUNTRIES, CATEGORIES, COUNTRY_CODES,
  type SourceInfo, type Meta,
} from '@ticker/shared';
import * as store from './db.js';
import { getTicker, getDetail, type Deps } from './ticker.js';

export function tokenValid(given: string | undefined, expected: string): boolean {
  if (!expected || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b); // Hash gleicht Längen aus
}

export async function buildApp(d: Deps) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization'] }, trustProxy: true });

  await app.register(helmet, { hsts: true });
  await app.register(cors, { origin: d.cfg.corsOrigin || false });
  await app.register(rateLimit, { max: d.cfg.rateLimitPerMinute, timeWindow: '1 minute', allowList: (req) => req.url === '/healthz' });

  app.get('/healthz', async (_req, reply) => reply.type('text/plain').send('ok'));

  await app.register(async (api) => {
    api.addHook('onRequest', async (req, reply) => {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
      if (!tokenValid(m?.[1], d.cfg.apiToken)) return reply.code(401).send();
    });

    api.get('/meta', async (): Promise<Meta> => ({
      countries: COUNTRY_CODES.map((code) => ({ code, ...COUNTRIES[code] })),
      categories: CATEGORIES.map((c) => ({ ...c })),
    }));

    api.get('/settings', async () => store.getSettings(d.db));
    api.put('/settings', async (req, reply) => {
      const p = SettingsSchema.safeParse(req.body);
      if (!p.success) return reply.code(400).send({ error: 'Ungültige Einstellungen', issues: p.error.issues });
      // Quellen-IDs müssen existieren und zum Land gehören.
      const known = store.listSources(d.db);
      for (const c of COUNTRY_CODES) {
        for (const s of p.data.sources[c] ?? []) {
          if (!known.some((k) => k.id === s.id && k.country === c)) return reply.code(400).send({ error: `Unbekannte Quelle ${s.id}` });
        }
      }
      store.saveSettings(d.db, p.data);
      return store.getSettings(d.db);
    });

    api.get('/sources', async (req, reply) => {
      const q = z.object({ country: CountrySchema.optional() }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'Ungültiges Land' });
      return store.listSources(d.db, q.data.country).map((s): SourceInfo => ({
        id: s.id, country: s.country, name: s.name, type: s.type, enabled: s.enabled,
        categories: Object.keys(s.feeds), status: s.status, checkedAt: s.checkedAt, message: s.message,
      }));
    });

    api.get('/ticker', async (req, reply) => {
      const q = z.object({ country: CountrySchema, category: CategorySchema, refresh: z.enum(['0', '1']).optional() }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'Ungültige Parameter' });
      if (!store.getSettings(d.db).activeCountries.includes(q.data.country)) return reply.code(400).send({ error: 'Land nicht aktiv' });
      try {
        return await getTicker(d, q.data.country, q.data.category, q.data.refresh === '1');
      } catch (e) {
        req.log.error({ err: e instanceof Error ? e.message : e }, 'ticker failed');
        return reply.code(502).send({ error: 'Quellen nicht erreichbar' });
      }
    });

    api.get('/ticker/:itemId/detail', async (req, reply) => {
      const { itemId } = req.params as { itemId: string };
      if (!/^[0-9a-f]{16}$/.test(itemId)) return reply.code(400).send({ error: 'Ungültige ID' });
      const detail = await getDetail(d, itemId);
      return detail ?? reply.code(404).send({ error: 'Unbekannte Meldung' });
    });

    api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Nicht gefunden' }));
  }, { prefix: '/api' });

  const webDir = resolve(d.cfg.webDir);
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(401).send();
      return reply.sendFile('index.html');
    });
  }
  return app;
}
