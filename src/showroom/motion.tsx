import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { asset } from '../lib/brand';

/* =====================================================================
   Website animation helpers (showroom only).
   To animate any element as it scrolls into view, give it data-reveal:
     <div data-reveal>…</div>                 slide up + fade
     <div data-reveal="fade">…</div>          fade only
     <div data-reveal="zoom">…</div>          gentle zoom in
     <div data-reveal style={{ '--d': '200ms' } as CSSProperties}>  delay
   ===================================================================== */

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const canHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Watches the page for [data-reveal] elements (including ones added later) and reveals them on scroll. */
export function useScrollReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || reducedMotion()) {
      const show = () => document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
      show(); const mo = new MutationObserver(show); mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    const scan = () => document.querySelectorAll('[data-reveal]:not(.is-in):not([data-watched])').forEach((el) => { el.setAttribute('data-watched', ''); io.observe(el); });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
}

/** Delay helper for data-reveal / intro animations. */
export const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** Splits a headline into words that rise in one after another. */
export function Words({ text, start = 0, className = '' }: { text: string; start?: number; className?: string }) {
  return <>{text.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : <span key={i} className={`intro-word ${className}`} style={{ '--i': start + i / 2 } as CSSProperties}>{w}</span>))}</>;
}

/** Text that appears letter by letter when scrolled into view. */
export function TypeLine({ text, className = '' }: { text: string; className?: string }) {
  const letters = Array.from(text).slice(0, 260);
  return (
    <p data-reveal="fade" className={className} aria-label={text}>
      {letters.map((ch, i) => <span key={i} aria-hidden className="type-letter" style={{ '--i': i } as CSSProperties}>{ch}</span>)}
    </p>
  );
}

/** 3D tilt + gold glare that follows the mouse (computers only). */
export function useTilt<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canHover() || reducedMotion()) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
        el.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
      });
    };
    const leave = () => { cancelAnimationFrame(raf); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

/** Moves an element slower than the page while scrolling (depth effect). */
export function useParallax<T extends HTMLElement>(speed = 0.15): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { const y = Math.min(window.scrollY, window.innerHeight * 1.2); el.style.transform = `translate3d(0, ${y * speed}px, 0)`; });
    };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [speed]);
  return ref;
}

/** True while the element is on screen (used to auto-flip product cards on phones). */
export function useInView<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return [ref, inView];
}

/** Gold V-emblem loading screen — shown once per visit, only until the catalogue is ready. */
export function Splash({ ready }: { ready: boolean }) {
  const [show, setShow] = useState(() => { try { return !sessionStorage.getItem('vgx-splash') && !reducedMotion(); } catch { return false; } });
  const [leaving, setLeaving] = useState(false);
  const [minDone, setMinDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMinDone(true), 1300); const max = setTimeout(() => setLeaving(true), 4000); return () => { clearTimeout(t); clearTimeout(max); }; }, []);
  useEffect(() => { if (ready && minDone) setLeaving(true); }, [ready, minDone]);
  useEffect(() => {
    if (!leaving) return;
    try { sessionStorage.setItem('vgx-splash', '1'); } catch { /* ignore */ }
    const t = setTimeout(() => setShow(false), 900); return () => clearTimeout(t);
  }, [leaving]);
  if (!show) return null;
  return (
    <div className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink ${leaving ? 'splash-out' : ''}`} aria-hidden>
      <img src={asset('brand/emblem-gold.png')} alt="" className="intro-glow h-20" />
      <div className="mt-6 h-px w-40 overflow-hidden bg-white/10"><div className="splash-line h-full w-full bg-gradient-to-r from-gold-dark via-gold-light to-gold" /></div>
      <p className="intro-rise mt-4 font-display text-[10px] tracking-[0.5em] text-gold/80" style={delay(500)}>VANGELUX</p>
    </div>
  );
}

/** Launch countdown banner (set the title and date in Admin → Website & contact). */
export function Countdown({ title, at, link }: { title: string; at: string; link?: string }) {
  const target = at ? new Date(at).getTime() : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!title || Number.isNaN(target)) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [title, target]);
  if (!title || Number.isNaN(target) || target <= now) return null;
  let s = Math.floor((target - now) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  const parts: [number, string][] = [[d, 'd'], [h, 'h'], [m, 'm'], [s, 's']];
  const body = (
    <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span className="font-display tracking-[0.25em]">{title.toUpperCase()}</span>
      <span className="flex gap-1.5 tabular-nums">
        {parts.map(([v, u]) => <span key={u} className="rounded bg-ink/15 px-1.5 py-0.5 font-semibold"><span key={v} className="digit-tick">{String(v).padStart(2, '0')}</span>{u}</span>)}
      </span>
    </span>
  );
  return (
    <div className="bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-4 py-2 text-center text-[11px] text-ink">
      {link ? <a href={link} target="_blank" rel="noreferrer" className="hover:underline">{body}</a> : body}
    </div>
  );
}

/* -- Verse of the day (King James Version — public domain). One verse per calendar day. -- */
const VERSES: [string, string][] = [
  ['Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.', 'Matthew 5:16'],
  ['For I am not ashamed of the gospel of Christ: for it is the power of God unto salvation to every one that believeth.', 'Romans 1:16'],
  ['Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost.', 'Matthew 28:19'],
  ['I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'],
  ['Thy word is a lamp unto my feet, and a light unto my path.', 'Psalm 119:105'],
  ['Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Joshua 1:9'],
  ['Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5'],
  ['The LORD is my shepherd; I shall not want.', 'Psalm 23:1'],
  ['Ye are the light of the world. A city that is set on an hill cannot be hid.', 'Matthew 5:14'],
  ['And whatsoever ye do, do it heartily, as to the Lord, and not unto men.', 'Colossians 3:23'],
  ['For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 'John 3:16'],
  ['But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles.', 'Isaiah 40:31'],
  ['Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.', 'John 14:6'],
  ['This is the day which the LORD hath made; we will rejoice and be glad in it.', 'Psalm 118:24'],
  ['Let all your things be done with charity.', '1 Corinthians 16:14'],
  ['Be not overcome of evil, but overcome evil with good.', 'Romans 12:21'],
  ['The light shineth in darkness; and the darkness comprehended it not.', 'John 1:5'],
  ['Arise, shine; for thy light is come, and the glory of the LORD is risen upon thee.', 'Isaiah 60:1'],
  ['Be ye doers of the word, and not hearers only.', 'James 1:22'],
  ['For we walk by faith, not by sight.', '2 Corinthians 5:7'],
  ['Rejoice in the Lord alway: and again I say, Rejoice.', 'Philippians 4:4'],
  ['God is our refuge and strength, a very present help in trouble.', 'Psalm 46:1'],
  ['Fight the good fight of faith, lay hold on eternal life.', '1 Timothy 6:12'],
  ['Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.', '1 Timothy 4:12'],
  ['Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', '2 Corinthians 5:17'],
  ['The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee.', 'Numbers 6:24–25'],
  ['Heaven and earth shall pass away, but my words shall not pass away.', 'Matthew 24:35'],
  ['For with God nothing shall be impossible.', 'Luke 1:37'],
  ['Thou wilt keep him in perfect peace, whose mind is stayed on thee: because he trusteth in thee.', 'Isaiah 26:3'],
  ['Every word of God is pure: he is a shield unto them that put their trust in him.', 'Proverbs 30:5'],
  ['Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him.', 'Revelation 3:20'],
];

export function verseOfTheDay(date = new Date()): [string, string] {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  return VERSES[(day + date.getFullYear()) % VERSES.length];
}
