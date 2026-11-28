import { useEffect, useState } from 'react';
import { Bell, ArrowRight } from 'lucide-react';
import { mediaUrl } from '../lib/storage';
import { asset, whatsappLink } from '../lib/brand';
import type { PublicLaunch } from '../lib/types';
import { delay } from './motion';

/** Current time, updated every second (only while something is counting down). */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
  return now;
}

/** Milliseconds → days / hours / minutes / seconds. */
export function splitTime(ms: number) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return { d, h, m, s };
}

const upcoming = (l: PublicLaunch, now: number) => new Date(l.launch_at).getTime() > now;

/** One number box that flips each time its value changes. */
function TimeBox({ value, label, big }: { value: number; label: string; big?: boolean }) {
  const v = String(value).padStart(2, '0');
  return (
    <div className={`flex flex-col items-center rounded-lg border border-gold/30 bg-black/40 backdrop-blur ${big ? 'min-w-[4.2rem] px-3 py-3 sm:min-w-[5.5rem] sm:px-4 sm:py-4' : 'px-2 py-1'}`}>
      <span className={`font-display tabular-nums text-ivory ${big ? 'text-3xl sm:text-5xl' : 'text-sm'}`}>
        {v.split('').map((ch, i) => <span key={`${i}-${ch}`} className="digit-tick">{ch}</span>)}
      </span>
      <span className={`mt-1 tracking-[0.25em] text-gold ${big ? 'text-[10px] sm:text-xs' : 'text-[8px]'}`}>{label}</span>
    </div>
  );
}

export function Clock({ ms, big }: { ms: number; big?: boolean }) {
  const t = splitTime(ms);
  return (
    <div className={`flex ${big ? 'gap-2 sm:gap-3' : 'gap-1'}`} role="timer" aria-label={`${t.d} days ${t.h} hours ${t.m} minutes ${t.s} seconds`}>
      <TimeBox value={t.d} label={big ? 'DAYS' : 'D'} big={big} />
      <TimeBox value={t.h} label={big ? 'HOURS' : 'H'} big={big} />
      <TimeBox value={t.m} label={big ? 'MINUTES' : 'M'} big={big} />
      <TimeBox value={t.s} label={big ? 'SECONDS' : 'S'} big={big} />
    </div>
  );
}

/** Slim gold banner at the very top of the website (first upcoming countdown with "banner" ticked). */
export function LaunchBanner({ launches }: { launches: PublicLaunch[] }) {
  const now = useNow(launches.length > 0);
  const l = launches.find((x) => x.show_banner && upcoming(x, now));
  if (!l) return null;
  const t = splitTime(new Date(l.launch_at).getTime() - now);
  const go = () => {
    if (window.location.hash !== '#/' && window.location.hash !== '') { window.location.hash = '#/'; setTimeout(() => document.getElementById('launches')?.scrollIntoView({ behavior: 'smooth' }), 400); }
    else document.getElementById('launches')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <button onClick={go} className="block w-full bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-4 py-2 text-center text-[11px] text-ink">
      <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="font-display tracking-[0.25em]">{l.title.toUpperCase()}</span>
        <span className="flex gap-1.5 font-semibold tabular-nums">
          {([[t.d, 'd'], [t.h, 'h'], [t.m, 'm'], [t.s, 's']] as const).map(([v, u]) => (
            <span key={u} className="rounded bg-ink/15 px-1.5 py-0.5">{String(v).padStart(2, '0').split('').map((ch, i) => <span key={`${i}-${ch}`} className="digit-tick">{ch}</span>)}{u}</span>
          ))}
        </span>
      </span>
    </button>
  );
}

/** Big countdown section(s) on the home page. */
export function LaunchSection({ launches }: { launches: PublicLaunch[] }) {
  const now = useNow(launches.length > 0);
  const shown = launches.filter((l) => upcoming(l, now) || (l.ended_text ?? '').trim());
  if (!shown.length) return null;
  return (
    <section id="launches" className="relative overflow-hidden border-y border-gold/20 bg-ink">
      <div className="stage-light-a pointer-events-none absolute -inset-[30%]" style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(201,162,74,0.16), transparent 45%)' }} aria-hidden />
      <div className="relative mx-auto max-w-7xl space-y-16 px-5 py-20">
        {shown.map((l, i) => <LaunchCard key={l.id} l={l} now={now} flip={i % 2 === 1} />)}
      </div>
    </section>
  );
}

function LaunchCard({ l, now, flip }: { l: PublicLaunch; now: number; flip: boolean }) {
  const at = new Date(l.launch_at);
  const live = at.getTime() > now;
  const when = at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const enquire = whatsappLink(live ? `Hi VANGELUX! Please notify me when "${l.title}" launches.` : `Hi VANGELUX! I'm interested in "${l.title}".`);
  const button = l.link_url
    ? <a href={l.link_url} target="_blank" rel="noreferrer" className="btn-sweep inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-display text-xs font-semibold tracking-[0.25em] text-ink transition hover:bg-gold-light">{(l.button_label || (live ? 'LEARN MORE' : 'SHOP NOW')).toUpperCase()} <ArrowRight className="h-4 w-4" /></a>
    : <a href={enquire} target="_blank" rel="noreferrer" className="btn-sweep inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-display text-xs font-semibold tracking-[0.25em] text-ink transition hover:bg-gold-light"><Bell className="h-4 w-4" /> {(l.button_label || (live ? 'NOTIFY ME ON WHATSAPP' : 'ENQUIRE NOW')).toUpperCase()}</a>;

  return (
    <div className={`grid items-center gap-10 lg:grid-cols-2 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div data-reveal="zoom" className="relative">
        <div className="absolute -inset-4 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative overflow-hidden rounded-sm ring-1 ring-gold/25">
          {l.image_path
            ? <img src={mediaUrl(l.image_path)} alt={l.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            : <div className="flex aspect-[4/3] items-center justify-center bg-charcoal"><img src={asset('brand/emblem-gold.png')} alt="" className="h-24 opacity-50" /></div>}
          {!live && <span className="absolute left-4 top-4 rounded-full bg-gold px-3 py-1 font-display text-[10px] tracking-[0.25em] text-ink">AVAILABLE NOW</span>}
        </div>
      </div>
      <div className="text-center lg:text-left">
        <p data-reveal className="font-display text-xs tracking-[0.45em] text-gold">{live ? 'COMING SOON' : 'JUST LAUNCHED'}</p>
        <h2 data-reveal style={delay(100)} className="mt-4 font-display text-3xl font-semibold tracking-wide sm:text-5xl"><span className="gold-shimmer">{l.title}</span></h2>
        {l.subtitle && <p data-reveal style={delay(180)} className="mt-4 whitespace-pre-line text-neutral-300">{l.subtitle}</p>}
        {live ? (
          <div data-reveal style={delay(260)} className="mt-8 flex flex-col items-center gap-3 lg:items-start">
            <Clock ms={at.getTime() - now} big />
            <p className="text-xs tracking-[0.2em] text-neutral-500">LAUNCHES {when.toUpperCase()}</p>
          </div>
        ) : (
          <p data-reveal style={delay(260)} className="mt-8 font-display text-2xl tracking-[0.2em] text-gold-light">{(l.ended_text ?? '').toUpperCase()}</p>
        )}
        <div data-reveal style={delay(340)} className="mt-8">{button}</div>
      </div>
    </div>
  );
}
