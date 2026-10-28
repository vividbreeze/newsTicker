import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb, seedIfEmpty } from './db.js';
import { createAnthropicLlm } from './llm.js';
import { buildApp } from './app.js';
import { scheduleDailyCheck } from './health.js';

const cfg = loadConfig();
if (!cfg.apiToken || cfg.apiToken.length < 16) {
  console.error('API_TOKEN fehlt oder ist zu kurz (mind. 16 Zeichen, empfohlen: openssl rand -hex 32).');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const db = openDb(cfg.dbPath);
seedIfEmpty(db, process.env.SEED_PATH || resolve(here, '../seed/sources.json'));
const app = await buildApp({ cfg, db, llm: createAnthropicLlm(cfg, db), fetch });
scheduleDailyCheck(db, cfg);
await app.listen({ port: cfg.port, host: '0.0.0.0' });
