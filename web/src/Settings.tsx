import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { COUNTRY_CODES, type CountryCode, type Meta, type Settings, type SourceInfo } from '@ticker/shared';
import { api } from './api';
import type { Conn, Prefs } from './storage';

type Props = {
  conn: Conn; meta: Meta; settings: Settings; prefs: Prefs;
  onBack: () => void; onSettings: (s: Settings) => void; onConn: (c: Conn) => void; onPrefs: (p: Prefs) => void;
};

export function SettingsScreen({ conn, meta, settings, prefs, onBack, onSettings, onConn, onPrefs }: Props) {
  const [s, setS] = useState(settings);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [openC, setOpenC] = useState<CountryCode | null>(null);
  const [url, setUrl] = useState(conn.url);
  const [token, setToken] = useState(conn.token);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => { api.sources(conn).then(setSources).catch(() => {}); }, [conn]);

  async function push(next: Settings) {
    setS(next);
    try { onSettings(await api.saveSettings(conn, next)); setSaveErr(null); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen'); }
  }

  function toggleCountry(c: CountryCode) {
    const has = s.activeCountries.includes(c);
    if (has) return; // genau drei: ein inaktives Land ersetzt das dritte
    const next = [...s.activeCountries.slice(0, 2), c];
    push({ ...s, activeCountries: next });
  }
  function moveCountry(i: number, d: -1 | 1) {
    const a = [...s.activeCountries]; const j = i + d;
    if (j < 0 || j > 2) return;
    [a[i], a[j]] = [a[j], a[i]];
    push({ ...s, activeCountries: a });
  }
  function moveSource(c: CountryCode, i: number, d: -1 | 1) {
    const a = [...(s.sources[c] ?? [])]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    push({ ...s, sources: { ...s.sources, [c]: a } });
  }
  function toggleSource(c: CountryCode, id: string) {
    push({ ...s, sources: { ...s.sources, [c]: (s.sources[c] ?? []).map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) } });
  }

  async function testConn() {
    const c = { url: url.trim(), token: token.trim() };
    try { await api.meta(c); setTest({ ok: true, msg: 'Verbindung erfolgreich' }); onConn(c); }
    catch (e) { setTest({ ok: false, msg: e instanceof Error ? e.message : 'Fehler' }); }
  }

  const name = (c: CountryCode) => meta.countries.find((x) => x.code === c)!;
  const inactive = COUNTRY_CODES.filter((c) => !s.activeCountries.includes(c));
  const catLabel = (k: string) => meta.categories.find((c) => c.key === k)?.label ?? k;

  return (
    <div className="screen settings">
      <header className="nav">
        <button className="back" onClick={onBack}><ChevronLeft size={22} aria-hidden /> Zurück</button>
        <h1 className="nav-title">Einstellungen</h1>
      </header>
      <div className="content">
        {saveErr && <p className="err" role="alert">{saveErr}</p>}

        <h3 className="group-title">Server</h3>
        <div className="group">
          <label className="row field"><span>URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Leer = dieser Server" autoCapitalize="off" /></label>
          <label className="row field"><span>Token</span><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoCapitalize="off" /></label>
          <button className="row link" onClick={testConn}>Verbindung testen</button>
        </div>
        {test && <p className={test.ok ? 'footnote ok' : 'footnote err'}>{test.msg}</p>}

        <h3 className="group-title">Länder (genau 3, in Anzeigereihenfolge)</h3>
        <div className="group">
          {s.activeCountries.map((c, i) => (
            <div className="row" key={c}>
              <span className="grow">{name(c).flag} {name(c).name}</span>
              <button className="icon-btn small" disabled={i === 0} onClick={() => moveCountry(i, -1)} aria-label={`${name(c).name} nach oben`}><ArrowUp size={18} /></button>
              <button className="icon-btn small" disabled={i === 2} onClick={() => moveCountry(i, 1)} aria-label={`${name(c).name} nach unten`}><ArrowDown size={18} /></button>
              <Check size={20} className="accent" aria-label="aktiv" />
            </div>
          ))}
          {inactive.map((c) => (
            <button className="row link" key={c} onClick={() => toggleCountry(c)}>
              <span className="grow left">{name(c).flag} {name(c).name}</span><span className="footnote">ersetzt {name(s.activeCountries[2]).name}</span>
            </button>
          ))}
        </div>

        <h3 className="group-title">Anzahl Meldungen: {s.itemCount}</h3>
        <div className="group">
          <div className="row">
            <input className="slider" type="range" min={5} max={30} value={s.itemCount} aria-label="Anzahl Meldungen"
              onChange={(e) => setS({ ...s, itemCount: +e.target.value })}
              onPointerUp={() => push(s)} onKeyUp={() => push(s)} onTouchEnd={() => push(s)} />
          </div>
        </div>

        <h3 className="group-title">Zusammenfassung</h3>
        <div className="segmented" role="radiogroup" aria-label="Zusammenfassung">
          {([['short', 'Kurz'], ['medium', 'Mittel'], ['long', 'Lang']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={s.summaryLength === k} className={s.summaryLength === k ? 'on' : ''} onClick={() => push({ ...s, summaryLength: k })}>{l}</button>
          ))}
        </div>

        <h3 className="group-title">Quellen</h3>
        {s.activeCountries.map((c) => (
          <div className="group" key={c}>
            <button className="row link" onClick={() => setOpenC(openC === c ? null : c)} aria-expanded={openC === c}>
              <span className="grow left">{name(c).flag} {name(c).name}</span>
              {openC === c ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {openC === c && (s.sources[c] ?? []).map((src, i) => {
              const info = sources.find((x) => x.id === src.id);
              return (
                <div className="row source-row" key={src.id}>
                  <span className={`light ${info?.status ?? 'unknown'}`} role="img" aria-label={`Status: ${info?.status ?? 'unbekannt'}`} />
                  <div className="grow">
                    <div>{info?.name ?? src.id}</div>
                    <div className="footnote">
                      {info ? info.categories.map(catLabel).join(', ') : ''}
                      {info?.message ? ` · ${info.message}` : ''}
                      {info?.checkedAt ? ` · geprüft ${new Date(info.checkedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}` : ''}
                    </div>
                  </div>
                  <button className="icon-btn small" disabled={i === 0} onClick={() => moveSource(c, i, -1)} aria-label="Nach oben"><ArrowUp size={18} /></button>
                  <button className="icon-btn small" disabled={i === (s.sources[c] ?? []).length - 1} onClick={() => moveSource(c, i, 1)} aria-label="Nach unten"><ArrowDown size={18} /></button>
                  <label className="switch"><input type="checkbox" checked={src.enabled} onChange={() => toggleSource(c, src.id)} aria-label={`${info?.name ?? src.id} aktiv`} /><span /></label>
                </div>
              );
            })}
          </div>
        ))}

        <h3 className="group-title">Darstellung</h3>
        <div className="segmented" role="radiogroup" aria-label="Darstellung">
          {([['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={prefs.theme === k} className={prefs.theme === k ? 'on' : ''} onClick={() => onPrefs({ ...prefs, theme: k })}>{l}</button>
          ))}
        </div>
        <p className="footnote pad">Einstellungen werden auf dem Server gespeichert und gelten für alle Geräte.</p>
      </div>
    </div>
  );
}
