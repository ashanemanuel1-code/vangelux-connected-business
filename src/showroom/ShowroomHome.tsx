import { useMemo, useState } from 'react';
import { ChevronDown, MessageCircle, Loader2 } from 'lucide-react';
import { useCatalog } from './useCatalog';
import ProductCard from './ProductCard';
import { mediaUrl } from '../lib/storage';
import { asset, whatsappLink, useSite } from '../lib/brand';
import { label } from '../lib/format';
import { Words, TypeLine, useParallax, delay, verseOfTheDay } from './motion';

export default function ShowroomHome() {
  const { catalog, loading, error } = useCatalog();
  const site = useSite();
  const [col, setCol] = useState('');
  const [cat, setCat] = useState('');
  const products = useMemo(() => catalog?.products ?? [], [catalog]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[], [products]);
  const shown = products.filter((p) => (!col || p.collection_id === col) && (!cat || p.category === cat));
  const heroImg = useParallax<HTMLDivElement>(0.12);
  const [verse, verseRef] = verseOfTheDay();
  const titleWords = site.heroTitle.split(/\s+/).filter(Boolean).length;

  return (
    <main>
      {/* HERO */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden pt-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="stage-light-a absolute -inset-[20%]" style={{ background: 'radial-gradient(ellipse at 70% 40%, rgba(201,162,74,0.20), transparent 50%)' }} />
          <div className="stage-light-b absolute -inset-[20%]" style={{ background: 'radial-gradient(ellipse at 15% 85%, rgba(201,162,74,0.10), transparent 45%)' }} />
        </div>
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <img src={asset('brand/emblem-gold.png')} alt="" className="intro-glow mx-auto mb-8 h-16 lg:mx-0" />
            <p className="intro-rise font-display text-xs tracking-[0.45em] text-gold" style={delay(300)}>{site.heroEyebrow}</p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] tracking-wide [perspective:600px] sm:text-5xl lg:text-6xl" aria-label={`${site.heroTitle} ${site.heroTitleGold}`}>
              <Words text={site.heroTitle} />{site.heroTitleGold && <><br /><Words text={site.heroTitleGold} start={titleWords} className="gold-shimmer" /></>}
            </h1>
            <p className="intro-rise mt-6 text-lg italic text-neutral-300" style={delay(1300)}>“{site.tagline}”</p>
            <div className="intro-rise mt-10 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start" style={delay(1550)}>
              <a href="#shop" onClick={(e) => { e.preventDefault(); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); }}
                className="btn-sweep rounded-full bg-gold px-8 py-3.5 font-display text-xs font-semibold tracking-[0.25em] text-ink transition hover:bg-gold-light">EXPLORE THE COLLECTION</a>
              <a href={whatsappLink('Hi VANGELUX! I would like to know more.')} target="_blank" rel="noreferrer"
                className="btn-sweep flex items-center justify-center gap-2 rounded-full border border-white/25 px-8 py-3.5 font-display text-xs tracking-[0.25em] transition hover:border-gold hover:text-gold"><MessageCircle className="h-4 w-4" /> ENQUIRE</a>
            </div>
          </div>
          <div ref={heroImg} className="intro-rise relative will-change-transform" style={delay(700)}>
            <div className="absolute -inset-4 rounded-full bg-gold/10 blur-3xl" />
            <img src={asset('brand/great-commission-tees.jpg')} alt="VANGELUX Great Commission oversized tees" className="relative w-full rounded-sm shadow-2xl ring-1 ring-gold/20" />
          </div>
        </div>
        <ChevronDown className="absolute bottom-6 left-1/2 h-6 w-6 -translate-x-1/2 animate-bounce text-gold/60" />
      </section>

      {/* STORY */}
      <section id="story" className="bg-ivory text-ink">
        <div className="mx-auto max-w-5xl px-5 py-24 text-center">
          <p data-reveal className="font-display text-xs tracking-[0.45em] text-gold-dark">OUR STORY</p>
          <h2 data-reveal style={delay(100)} className="mt-4 whitespace-pre-line font-display text-3xl font-semibold tracking-wide sm:text-4xl">{site.storyTitle}</h2>
          <div data-reveal="zoom" style={delay(200)} className="gold-rule mx-auto my-10 w-40" />
          <p data-reveal style={delay(250)} className="mx-auto max-w-3xl whitespace-pre-line text-lg leading-relaxed text-neutral-700">{site.storyText}</p>
          <div className="mt-14 grid gap-6 text-left md:grid-cols-2">
            <div data-reveal style={delay(100)} className="rounded-sm border border-neutral-300 bg-white p-8 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
              <p className="font-display text-xs tracking-[0.3em] text-gold-dark">TO THE WORLD</p>
              <p className="mt-3 whitespace-pre-line text-neutral-700">{site.toWorld}</p>
            </div>
            <div data-reveal style={delay(250)} className="rounded-sm border border-neutral-300 bg-white p-8 transition duration-500 hover:-translate-y-1 hover:shadow-xl">
              <p className="font-display text-xs tracking-[0.3em] text-gold-dark">TO THE WEARER</p>
              <p className="mt-3 whitespace-pre-line text-neutral-700">{site.toWearer}</p>
            </div>
          </div>
          {site.scripture && <TypeLine text={site.scripture} className="mt-12 font-display text-sm uppercase tracking-[0.2em] text-neutral-500" />}
        </div>
      </section>

      {/* VERSE OF THE DAY */}
      <section className="relative overflow-hidden border-y border-gold/15 bg-ink">
        <div className="stage-light-b pointer-events-none absolute -inset-[30%]" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(201,162,74,0.10), transparent 45%)' }} aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <p data-reveal className="font-display text-[11px] tracking-[0.45em] text-gold">VERSE OF THE DAY</p>
          <p data-reveal style={delay(150)} className="mt-6 font-display text-xl leading-relaxed tracking-wide text-ivory sm:text-2xl">“{verse}”</p>
          <p data-reveal style={delay(300)} className="mt-5 text-xs tracking-[0.3em] text-neutral-400">{verseRef.toUpperCase()} · KJV</p>
        </div>
      </section>

      {/* COLLECTIONS */}
      <section id="collections" className="mx-auto max-w-7xl px-5 py-24">
        <div data-reveal className="text-center"><p className="font-display text-xs tracking-[0.45em] text-gold">COLLECTIONS</p>
          <h2 className="mt-3 font-display text-3xl tracking-wide">{site.collectionsTitle}</h2></div>
        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div> : (
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(catalog?.collections ?? []).map((c, ci) => {
              const count = products.filter((p) => p.collection_id === c.id).length;
              return (
                <button key={c.id} onClick={() => { setCol(c.id); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); }}
                  data-reveal style={delay(ci * 150)} className="group relative overflow-hidden rounded-sm border border-white/10 bg-charcoal text-left transition-colors duration-500 hover:border-gold/40">
                  <div className="aspect-[16/10] overflow-hidden bg-black">
                    {c.artwork_path ? <img src={mediaUrl(c.artwork_path)} alt={c.name} className="h-full w-full object-contain transition duration-700 group-hover:scale-105" />
                      : <div className="flex h-full items-center justify-center"><img src={asset('brand/emblem-gold.png')} className="h-20 opacity-40" alt="" /></div>}
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between"><p className="font-display text-xs tracking-[0.3em] text-gold">{c.volume_label}</p>
                      <span className="rounded-full border border-gold/40 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">{label(c.status)}</span></div>
                    <h3 className="mt-2 font-display text-2xl tracking-wide">{c.name}</h3>
                    {c.tagline && <p className="mt-1 text-sm tracking-wider text-neutral-300">{c.tagline}</p>}
                    {c.scripture && <p className="mt-1 text-xs italic text-neutral-500">{c.scripture}</p>}
                    {c.description && <p className="mt-3 line-clamp-3 text-sm text-neutral-400">{c.description}</p>}
                    <p className="mt-4 font-display text-[11px] tracking-[0.25em] text-gold group-hover:underline">{count ? `VIEW ${count} PIECE${count > 1 ? 'S' : ''} →` : 'COMING SOON'}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* SHOP */}
      <section id="shop" className="border-t border-white/5 bg-charcoal/40">
        <div className="mx-auto max-w-7xl px-5 py-24">
          <div data-reveal className="text-center"><p className="font-display text-xs tracking-[0.45em] text-gold">THE CATALOGUE</p>
            <h2 className="mt-3 font-display text-3xl tracking-wide">{site.shopTitle}</h2></div>
          <div className="no-scrollbar mt-10 flex gap-2 overflow-x-auto pb-1 md:justify-center">
            <Chip on={!col && !cat} onClick={() => { setCol(''); setCat(''); }}>All</Chip>
            {(catalog?.collections ?? []).map((c) => <Chip key={c.id} on={col === c.id} onClick={() => setCol(col === c.id ? '' : c.id)}>{c.volume_label ?? c.name}</Chip>)}
            {categories.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c}</Chip>)}
          </div>
          {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
            : error === 'not-configured' ? <p className="py-20 text-center text-neutral-500">The showroom is being set up. Please check back soon.</p>
            : error ? <p className="py-20 text-center text-neutral-500">We couldn't load the catalogue right now. Please refresh in a moment.</p>
            : shown.length === 0 ? (
              <div className="py-20 text-center">
                <p className="font-display tracking-widest text-neutral-400">NEW PIECES ARE ON THE WAY</p>
                <p className="mt-2 text-sm text-neutral-500">Follow <a className="text-gold" href={site.instagram} target="_blank" rel="noreferrer">{site.instagramHandle}</a> for the launch.</p>
              </div>
            ) : (
              <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((p, i) => <div key={p.id} data-reveal style={delay((i % 4) * 110)}><ProductCard p={p} index={i} /></div>)}
              </div>
            )}
        </div>
      </section>
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`shrink-0 rounded-full border px-4 py-2 font-display text-[11px] tracking-[0.2em] transition ${on ? 'border-gold bg-gold text-ink' : 'border-white/15 text-neutral-300 hover:border-gold hover:text-gold'}`}>{String(children).toUpperCase()}</button>;
}
