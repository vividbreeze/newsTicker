import { describe, it, expect } from 'vitest';
import { safeGet, resolveGoogleUrl } from '../src/article.js';
const cfg = { feedTimeoutMs: 1000, userAgent: 'x' };

describe('safeGet', () => {
  it('blockt interne Ziele', async () => {
    for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/', 'http://[::1]/', 'file:///etc/passwd'])
      await expect(safeGet(u, cfg, (async () => new Response('x')) as any)).rejects.toThrow();
  });
  it('blockt Redirect auf interne Adresse', async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })) as any;
    await expect(safeGet('https://example.com/', cfg, f)).rejects.toThrow('nicht erlaubt');
  });
});
describe('resolveGoogleUrl', () => {
  it('dekodiert eingebettete URL', async () => {
    const id = Buffer.from('\x08\x13\x22\x1ahttps://example.com/story-1\xd2\x01\x00').toString('base64url');
    expect(await resolveGoogleUrl(`https://news.google.com/rss/articles/${id}`, cfg, (async () => new Response('', { status: 500 })) as any)).toBe('https://example.com/story-1');
  });
  it('null, wenn nicht auflösbar', async () => {
    const f = (async () => new Response('<html></html>')) as any;
    expect(await resolveGoogleUrl('https://news.google.com/rss/articles/CBMiXXX', cfg, f)).toBeNull();
  });
});
