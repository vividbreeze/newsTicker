import { describe, it, expect } from 'vitest';
import { zipperMerge, filterByAge, sortByTime } from '../src/merge.js';
import type { FeedEntry } from '../src/feeds.js';
const e = (u: string, publishedAt: string | null = null): FeedEntry => ({ title: u, url: u, description: '', publishedAt, sourceName: null });

describe('zipperMerge', () => {
  it('verschränkt Quellen und markiert Platz 1 als Top', () => {
    const m = zipperMerge([
      { sourceId: 'a', sourceName: 'A', entries: [e('a1'), e('a2'), e('a3')] },
      { sourceId: 'b', sourceName: 'B', entries: [e('b1'), e('b2')] },
    ], 10);
    expect(m.map((x) => x.url)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3']);
    expect(m.map((x) => x.isTop)).toEqual([true, true, false, false, false]);
    expect(m.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it('kürzt auf das Limit', () => {
    const m = zipperMerge([{ sourceId: 'a', sourceName: 'A', entries: [e('1'), e('2'), e('3')] }], 2);
    expect(m).toHaveLength(2);
  });
  it('verwendet sourceName des Eintrags (Google News)', () => {
    const m = zipperMerge([{ sourceId: 'g', sourceName: 'Google', entries: [{ ...e('x'), sourceName: 'NHK' }] }], 5);
    expect(m[0].sourceName).toBe('NHK');
  });
});
describe('filterByAge', () => {
  it('verwirft Einträge älter als 48 h, behält undatierte', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    const r = filterByAge([e('new', '2026-10-28T10:00:00Z'), e('old', '2026-10-25T10:00:00Z'), e('nodate')], 48, now);
    expect(r.map((x) => x.url)).toEqual(['new', 'nodate']);
  });
});
describe('sortByTime', () => {
  it('sortiert neueste zuerst, vergibt Rang neu, behält isTop', () => {
    const m = zipperMerge([{ sourceId: 'a', sourceName: 'A', entries: [e('a1', '2026-10-28T08:00:00Z'), e('a2', '2026-10-28T11:00:00Z')] }], 5);
    const r = sortByTime(m);
    expect(r.map((x) => x.url)).toEqual(['a2', 'a1']);
    expect(r.map((x) => x.rank)).toEqual([1, 2]);
    expect(r.find((x) => x.url === 'a1')!.isTop).toBe(true);
  });
});
