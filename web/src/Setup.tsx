import { useState } from 'react';
import { api } from './api';
import type { Conn } from './storage';

export function Setup({ initial, onSave }: { initial: Conn; onSave: (c: Conn) => void }) {
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const conn = { url: url.trim(), token: token.trim() };
    try { await api.meta(conn); onSave(conn); }
    catch (err) { setState({ ok: false, msg: err instanceof Error ? err.message : 'Fehler' }); }
    finally { setBusy(false); }
  }
  return (
    <main className="setup">
      <h1 className="large-title">Nachrichten-Ticker</h1>
      <p className="footnote">Verbinde die App mit deinem Server.</p>
      <form onSubmit={submit}>
        <div className="group">
          <label className="row field"><span>Server-URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Leer = dieser Server" inputMode="url" autoCapitalize="off" autoCorrect="off" />
          </label>
          <label className="row field"><span>Token</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="API-Token" autoCapitalize="off" autoCorrect="off" required />
          </label>
        </div>
        {state && <p className={state.ok ? 'footnote ok' : 'footnote err'} role="alert">{state.msg}</p>}
        <button className="primary" disabled={busy || !token.trim()}>{busy ? 'Prüfe …' : 'Verbinden'}</button>
      </form>
    </main>
  );
}
