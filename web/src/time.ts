const tz = 'Europe/Berlin';
const hm = new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
const dm = new Intl.DateTimeFormat('de-DE', { timeZone: tz, day: '2-digit', month: '2-digit' });

export const clock = (iso: string) => hm.format(new Date(iso));
export function label(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = ymd.format(d);
  if (day === ymd.format(now)) return clock(iso);
  if (day === ymd.format(new Date(now.getTime() - 86400_000))) return `gestern ${clock(iso)}`;
  return `${dm.format(d)} ${clock(iso)}`;
}
