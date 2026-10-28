import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Settings as Cog, AlertTriangle } from 'lucide-react';
import type { Meta, Settings, TickerResponse } from '@ticker/shared';
import { api, ApiError } from './api';
import { load, save, type Conn, type Prefs } from './storage';
import { Setup } from './Setup';
import { SettingsScreen } from './Settings';
import { TickerList } from './TickerList';
import { CategoryIcon } from './icons';
import { clock } from './time';

const emptyConn: Conn = { url: '', token: '' };

export function App() {
  const [conn, setConn] = useState<Conn>(() => load('conn', emptyConn));
  const [prefs, setPrefs] = useState<Prefs>(() => load('prefs', { theme: 'system' }));
  const [meta, setMeta] = useState<Meta | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<'ticker' | 'settings'>('ticker');
  const [boot, setBoot] = useState<'loading' | 'setup' | 'ready' | 'error'>(conn.token ? 'loading' : 'setup');

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme === 'system' ? '' : prefs.theme;
    save('prefs', prefs);
  }, [prefs]);

  const init = useCallback(async (c: Conn) => {
    try {
      const [m, s] = await Promise.all([api.meta(c), api.settings(c)]);
      setMeta(m); setSettings(s); setBoot('ready');
    } catch (e) { setBoot(e instanceof ApiError && e.status === 401 ? 'setup' : 'error'); }
  }, []);
  useEffect(() => { if (conn.token) init(conn); }, [conn, init]);

  const saveConn = (c: Conn) => { save('conn', c); setConn(c); setBoot('loading'); };

  if (boot === 'setup') return <Setup initial={conn} onSave={saveConn} />;
  if (boot === 'loading') return <div className="center"><RefreshCw className="spin" aria-label="Lädt" /></div>;
  if (boot === 'error' || !meta || !settings)
    return <div className="center"><p>Server nicht erreichbar.</p><button className="primary" onClick={() => { setBoot('loading'); init(conn); }}>Erneut versuchen</button><button className="link-btn" onClick={() => setBoot('setup')}>Server ändern</button></div>;

  if (view === 'settings')
    return <SettingsScreen conn={conn} meta={meta} settings={settings} prefs={prefs}
      onBack={() => setView('ticker')} onSettings={setSettings} onConn={saveConn} onPrefs={setPrefs} />;

  return <Ticker conn={conn} meta={meta} settings={settings} prefs={prefs} setPrefs={setPrefs} openSettings={() => setView('settings')} />;
}

type TProps = { conn: Conn; meta: Meta; settings: Settings; prefs: Prefs; setPrefs: (p: Prefs) => void; openSettings: () => void };

function Ticker({ conn, meta, settings, prefs, setPrefs, openSettings }: TProps) {
  const countries = settings.activeCountries;
  const cats = meta.categories;
  const country = countries.includes(prefs.country as any) ? prefs.country! : countries[0];
  const category = cats.some((c) => c.key === prefs.category) ? prefs.category! : settings.defaultCategory;

  const [data, setData] = useState<TickerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memo = useRef(new Map<string, TickerResponse>());
  const detailMemo = useRef(new Map<string, Promise<any>>());
  const settingsKey = JSON.stringify([settings.itemCount, settings.summaryLength, settings.sources]);

  const fetchTicker = useCallback(async (refresh: boolean) => {
    const key = `${country}|${category}|${settingsKey}`;
    if (!refresh && memo.current.has(key)) { setData(memo.current.get(key)!); setError(null); return; }
    setLoading(true); setError(null);
    if (!refresh) setData(null);
    try {
      const r = await api.ticker(conn, country, category, refresh);
      memo.current.set(key, r);
      setData(r);
    } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    finally { setLoading(false); }
  }, [conn, country, category, settingsKey]);

  useEffect(() => { fetchTicker(false); }, [fetchTicker]);

  const pick = (p: Partial<Prefs>) => setPrefs({ ...prefs, country, category, ...p });
  const stepCat = useCallback((d: 1 | -1) => {
    const i = cats.findIndex((c) => c.key === category);
    const n = cats[i + d];
    if (n) setPrefs({ ...prefs, country, category: n.key });
  }, [cats, category, country, prefs, setPrefs]);

  // Tastaturkürzel
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') stepCat(1);
      else if (e.key === 'ArrowLeft') stepCat(-1);
      else if (['1', '2', '3'].includes(e.key)) setPrefs({ ...prefs, country: countries[+e.key - 1], category });
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [stepCat, countries, prefs, category, setPrefs]);

  // Wischen und Pull-to-Refresh
  const touch = useRef<{ x: number; y: number; top: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, top: window.scrollY <= 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current; if (!s?.top) return;
    const dy = e.touches[0].clientY - s.y, dx = Math.abs(e.touches[0].clientX - s.x);
    setPull(dy > 0 && dx < dy ? Math.min(dy, 90) : 0);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (pull >= 70) fetchTicker(true);
    else if (Math.abs(dx) > 70 && Math.abs(dy) < 50) stepCat(dx < 0 ? 1 : -1);
    setPull(0);
  };

  const loadDetail = useCallback((id: string) => {
    const k = `${id}|${settings.summaryLength}`;
    if (!detailMemo.current.has(k)) {
      const p = api.detail(conn, id);
      p.catch(() => detailMemo.current.delete(k));
      detailMemo.current.set(k, p);
    }
    return detailMemo.current.get(k)!;
  }, [conn, settings.summaryLength]);

  const meta1 = (c: string) => meta.countries.find((x) => x.code === c)!;
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [category]);
  useEffect(() => { if (prefs.country !== country || prefs.category !== category) save('prefs', { ...prefs, country, category }); }, [prefs, country, category]);

  return (
    <div className="screen" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <header className="head">
        <div className="title-row">
          <div>
            <h1 className="large-title">Nachrichten-Ticker</h1>
            {data && <p className="footnote">Stand: {clock(data.fetchedAt)}{data.stale && <span className="stale"> · veraltet</span>}</p>}
          </div>
          <div className="tools">
            <button className="icon-btn" onClick={() => fetchTicker(true)} aria-label="Aktualisieren"><RefreshCw size={22} className={loading ? 'spin' : ''} aria-hidden /></button>
            <button className="icon-btn" onClick={openSettings} aria-label="Einstellungen"><Cog size={22} aria-hidden /></button>
          </div>
        </div>
        <div className="segmented" role="tablist" aria-label="Land">
          {countries.map((c) => (
            <button key={c} role="tab" aria-selected={c === country} className={c === country ? 'on' : ''} onClick={() => pick({ country: c })}>
              {meta1(c).flag} {meta1(c).short}
            </button>
          ))}
        </div>
        <div className="chips" role="tablist" aria-label="Kategorie">
          {cats.map((c) => (
            <button key={c.key} role="tab" aria-selected={c.key === category} ref={c.key === category ? activeRef : undefined}
              className={c.key === category ? 'chip on' : 'chip'} onClick={() => pick({ category: c.key })}>
              <CategoryIcon name={c.icon} /> {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="ptr" style={{ height: pull }} aria-hidden>{pull >= 70 ? 'Loslassen zum Aktualisieren' : pull > 10 ? 'Ziehen zum Aktualisieren' : ''}</div>

      <main className="content">
        {data?.notice && <p className="banner" role="status"><AlertTriangle size={16} aria-hidden /> {data.notice}</p>}
        {data?.stale && <p className="banner" role="status"><AlertTriangle size={16} aria-hidden /> Quellen nicht erreichbar – letzter bekannter Stand.</p>}
        {data && data.sourceErrors.length > 0 && !data.stale && (
          <p className="banner" role="status"><AlertTriangle size={16} aria-hidden /> Ausgefallen: {data.sourceErrors.map((e) => e.sourceId).join(', ')}</p>
        )}
        {error && (
          <div className="state"><p>{error}</p><button className="primary" onClick={() => fetchTicker(true)}>Erneut versuchen</button></div>
        )}
        {!data && !error && <Skeleton />}
        {data && data.items.length === 0 && !error && <div className="state"><p>Keine Meldungen für diese Auswahl.</p></div>}
        {data && data.items.length > 0 && <TickerList key={`${country}${category}${data.fetchedAt}`} items={data.items} loadDetail={loadDetail} />}
      </main>
    </div>
  );
}

function Skeleton() {
  return (
    <ol className="timeline" aria-busy="true" aria-label="Lädt">
      {Array.from({ length: 5 }, (_, i) => (
        <li className="entry" key={i}><span className="dot" /><div className="skeleton"><i style={{ width: '30%' }} /><i /><i style={{ width: '80%' }} /></div></li>
      ))}
    </ol>
  );
}
