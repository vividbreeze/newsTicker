import type { Meta, Settings, SourceInfo, TickerDetail, TickerResponse } from '@ticker/shared';
import type { Conn } from './storage';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(conn: Conn, path: string, init?: RequestInit): Promise<T> {
  const base = conn.url.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${conn.token}` },
    });
  } catch { throw new ApiError(0, 'Server nicht erreichbar'); }
  if (res.status === 401) throw new ApiError(401, 'Token ungültig');
  if (!res.ok) {
    let msg = `Fehler ${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* leer */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: (c: Conn) => req<Meta>(c, '/api/meta'),
  settings: (c: Conn) => req<Settings>(c, '/api/settings'),
  saveSettings: (c: Conn, s: Settings) => req<Settings>(c, '/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  sources: (c: Conn) => req<SourceInfo[]>(c, '/api/sources'),
  ticker: (c: Conn, country: string, category: string, refresh = false) =>
    req<TickerResponse>(c, `/api/ticker?country=${country}&category=${category}${refresh ? '&refresh=1' : ''}`),
  detail: (c: Conn, id: string) => req<TickerDetail>(c, `/api/ticker/${id}/detail`),
};
