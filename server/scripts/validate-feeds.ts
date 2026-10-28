import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SeedSourceSchema } from '@ticker/shared';
import { loadConfig } from '../src/config.js';
import { parseFeed } from '../src/feeds.js';

const cfg = loadConfig();
const seed = z.array(SeedSourceSchema).parse(JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../seed/sources.json'), 'utf8')));

type Row = { source: string; cat: string; url: string; status: string; entries: number | string; newest: string; redirect: string };
const jobs: (() => Promise<Row>)[] = [];

for (const s of seed) for (const [cat, urls] of Object.entries(s.feeds)) for (const url of Array.isArray(urls) ? urls : [urls]) {
  jobs.push(async () => {
    const row: Row = { source: s.id, cat, url, status: '', entries: '-', newest: '-', redirect: '' };
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(cfg.feedTimeoutMs), headers: { 'User-Agent': cfg.userAgent } });
      row.status = String(res.status);
      if (res.redirected) row.redirect = res.url.length > 70 ? res.url.slice(0, 67) + '...' : res.url;
      if (res.ok) {
        const e = parseFeed(await res.text());
        row.entries = e.length;
        const newest = Math.max(0, ...e.map((x) => (x.publishedAt ? Date.parse(x.publishedAt) : 0)));
        row.newest = newest ? new Date(newest).toISOString().slice(0, 16).replace('T', ' ') : 'n/a';
      }
    } catch (e) { row.status = 'ERR ' + (e instanceof Error ? e.message : e); }
    return row;
  });
}

// begrenzte Parallelität, um Hosts nicht zu fluten
const rows: Row[] = [];
let idx = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (idx < jobs.length) rows.push(await jobs[idx++]()); }));
rows.sort((a, b) => (a.source + a.cat).localeCompare(b.source + b.cat));

const bad = (r: Row) => r.status !== '200' || !r.entries || r.entries === 0;
console.log('Quelle'.padEnd(12), 'Kat.'.padEnd(9), 'HTTP'.padEnd(14), 'Einträge'.padEnd(9), 'Jüngster'.padEnd(17), 'Redirect / URL');
for (const r of rows) console.log(`${bad(r) ? '✗' : '✓'} ${r.source.padEnd(10)} ${r.cat.padEnd(9)} ${r.status.padEnd(14)} ${String(r.entries).padEnd(9)} ${r.newest.padEnd(17)} ${bad(r) ? r.url : r.redirect}`);
const failed = rows.filter(bad);
console.log(`\n${rows.length - failed.length}/${rows.length} Feeds OK, ${failed.length} mit Problemen.`);
process.exit(failed.length ? 1 : 0);
