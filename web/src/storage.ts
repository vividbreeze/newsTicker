export function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* z. B. Private Mode */ }
}
export type Conn = { url: string; token: string };
export type Prefs = { country?: string; category?: string; theme: 'system' | 'light' | 'dark' };
