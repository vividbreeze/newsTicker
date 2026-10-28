import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFeed, splitGoogleTitle, itemId } from '../src/feeds.js';
const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('parseFeed', () => {
  it('parst RSS 2.0 inkl. Entities und HTML-Entfernung', () => {
    const e = parseFeed(fx('rss2.xml'));
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ title: 'First & best', url: 'https://ex.com/a', description: 'Hello world', publishedAt: '2026-10-28T10:00:00.000Z' });
    expect(e[1].description).toBe('');
  });
  it('parst RDF/RSS 1.0 (japanisch)', () => {
    const e = parseFeed(fx('rdf.xml'));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ title: '首相が会見', publishedAt: '2026-10-28T10:00:00.000Z' });
  });
  it('parst Atom und wählt alternate-Link', () => {
    const e = parseFeed(fx('atom.xml'));
    expect(e[0]).toMatchObject({ title: 'Atom Eintrag', url: 'https://heise.de/x', description: 'Kurz' });
  });
  it('wirft bei Nicht-Feed', () => {
    expect(() => parseFeed('<html></html>')).toThrow();
  });
  it('liest <source> bei Google News', () => {
    const e = parseFeed(fx('google.xml'));
    expect(e[0].sourceName).toBe('NHK');
    expect(splitGoogleTitle(e[0].title, e[0].sourceName)).toEqual({ title: '台風が接近', sourceName: 'NHK' });
  });
  it('trennt Quelle am Titelende ohne <source>', () => {
    expect(splitGoogleTitle('Foo - Bar - Reuters', null)).toEqual({ title: 'Foo - Bar', sourceName: 'Reuters' });
  });
  it('itemId ist stabil', () => {
    expect(itemId('https://a')).toBe(itemId('https://a'));
    expect(itemId('https://a')).toHaveLength(16);
  });
});
