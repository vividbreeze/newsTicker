import { useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Share } from 'lucide-react';
import type { TickerItem, TickerDetail } from '@ticker/shared';
import { label } from './time';

type Props = { items: TickerItem[]; loadDetail: (id: string) => Promise<TickerDetail> };

export function TickerList({ items, loadDetail }: Props) {
  return (
    <ol className="timeline">
      {items.map((it) => <Entry key={it.id} item={it} loadDetail={loadDetail} />)}
    </ol>
  );
}

function Entry({ item, loadDetail }: { item: TickerItem; loadDetail: Props['loadDetail'] }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TickerDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !started.current) {
      started.current = true;
      try { setDetail(await loadDetail(item.id)); } catch (e) { started.current = false; setErr(e instanceof Error ? e.message : 'Fehler'); }
    }
  }
  async function share() {
    const data = { title: item.title, url: item.url };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(`${item.title} ${item.url}`);
    } catch { /* abgebrochen */ }
  }

  return (
    <li className="entry">
      <span className="dot" aria-hidden />
      <div className="meta">
        <time dateTime={item.publishedAt}>{label(item.publishedAt)}</time>
        {item.isTop && <span className="badge">Top</span>}
        <span className="source">{item.sourceName}</span>
      </div>
      <h2 className="headline">{item.title}</h2>
      {item.teaser && <p className="teaser">{item.teaser}</p>}
      <div className="actions">
        <button className="more" onClick={toggle} aria-expanded={open}>
          Mehr <ChevronDown size={16} className={open ? 'chev open' : 'chev'} aria-hidden />
        </button>
        <button className="icon-btn small" onClick={share} aria-label={`„${item.title}“ teilen`}><Share size={18} aria-hidden /></button>
      </div>
      <div className={open ? 'detail open' : 'detail'}>
        <div className="detail-inner">
          {!detail && !err && <div className="skeleton" aria-busy="true"><i /><i /><i style={{ width: '60%' }} /></div>}
          {err && <p className="err">{err}</p>}
          {detail && (
            <>
              <p className="summary">{detail.summary}</p>
              {detail.limited && <p className="footnote">Nur Kurzfassung verfügbar.</p>}
            </>
          )}
          <a className="source-link" href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden /> Zur Quelle
          </a>
        </div>
      </div>
    </li>
  );
}
