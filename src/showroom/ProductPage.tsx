import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Loader2, Ruler, Check } from 'lucide-react';
import { Gallery } from './Gallery';
import { delay } from './motion';
import { SizeGuide } from './SizeGuide';
import { useCatalog } from './useCatalog';
import ProductCard, { mainImage } from './ProductCard';
import { whatsappLink } from '../lib/brand';
import { money0, effectivePrice, num } from '../lib/format';

export default function ProductPage() {
  const { id } = useParams();
  const { catalog, loading } = useCatalog();
  const p = catalog?.products.find((x) => x.id === id);
  const [active, setActive] = useState<string | undefined>();
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [guide, setGuide] = useState(false);
  const [sent, setSent] = useState(0);
  const chart = catalog?.size_charts?.find((c) => c.id === p?.size_chart_id);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    if (!p) return;
    // keep the selected image valid when the admin replaces images (live update)
    setActive((a) => (a && p.images.some((i) => i.path === a) ? a : mainImage(p)));
    setSize((s) => (s && p.sizes.includes(s) ? s : ''));
    setColor((c) => (c && p.colors.includes(c) ? c : p.colors.length === 1 ? p.colors[0] : ''));
  }, [p]);

  // Colour switcher: photos tagged with a colour show only for that colour; untagged photos always show.
  const photos = (p?.images ?? []).filter((i) => !color || !i.color || i.color === color);
  const pickColor = (c: string) => {
    const next = color === c ? '' : c;
    setColor(next);
    if (!p || !next) return;
    const ofColour = p.images.filter((i) => i.color === next);
    const best = ofColour.find((i) => i.kind === 'front') ?? ofColour[0];
    if (best) setActive(best.path);
  };
  useEffect(() => { if (active && photos.length && !photos.some((i) => i.path === active)) setActive(photos[0].path); }, [photos, active]);
  const hasColourPhotos = (c: string) => !!p?.images.some((i) => i.color === c);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (!p) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="font-display tracking-widest text-neutral-300">THIS PIECE IS NO LONGER AVAILABLE</p>
      <Link to="/" className="mt-6 text-sm text-gold underline">Back to the showroom</Link>
    </div>
  );

  const price = effectivePrice(p.selling_price, p.discount_percent);
  const url = `${window.location.origin}${window.location.pathname}#/product/${p.id}`;
  const msg = [
    `Hi VANGELUX! I'm interested in *${p.name}* (${p.sku}).`,
    size ? `Size: ${size}` : 'Size: (please advise)',
    color ? `Colour: ${color}` : null,
    `Price shown: ${money0(price)}`,
    url,
  ].filter(Boolean).join('\n');
  const related = catalog!.products.filter((x) => x.id !== p.id && (x.collection_id === p.collection_id || x.category === p.category)).slice(0, 4);

  return (
    <main className="mx-auto max-w-7xl px-5 pb-24 pt-24">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-xs tracking-[0.2em] text-neutral-400 hover:text-gold"><ArrowLeft className="h-4 w-4" /> BACK</Link>
      <div className="grid gap-10 lg:grid-cols-2">
        <div data-reveal="fade">
          <Gallery images={photos} active={active} onChange={setActive} alt={p.name} />
        </div>

        <div className="lg:pt-6" data-reveal style={delay(150)}>
          {p.collection_name && <p className="font-display text-xs tracking-[0.3em] text-gold">{p.collection_name}</p>}
          <h1 className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">{p.name}</h1>
          <p className="mt-2 text-sm text-neutral-500">{[p.category, p.fit_type, p.target_customer].filter(Boolean).join(' · ')}</p>
          <p className="mt-5 text-2xl font-semibold">{money0(price)}
            {num(p.discount_percent) > 0 && <span className="ml-3 text-base font-normal text-neutral-500 line-through">{money0(p.selling_price)}</span>}</p>
          {p.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t.name} className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: t.color }}>{t.name}</span>)}</div>}

          {p.description && <p className="mt-6 whitespace-pre-line leading-relaxed text-neutral-300">{p.description}</p>}

          {p.sizes.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-[11px] tracking-[0.3em] text-neutral-400">SELECT SIZE</p>
                {chart && <button onClick={() => setGuide(true)} className="flex items-center gap-1.5 font-display text-[11px] tracking-[0.2em] text-gold underline-offset-4 hover:underline"><Ruler className="h-3.5 w-3.5" /> SIZE GUIDE</button>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.sizes.map((s) => <button key={s} onClick={() => setSize(size === s ? '' : s)} className={`min-w-12 rounded-sm border px-4 py-2.5 text-sm transition ${size === s ? 'border-gold bg-gold text-ink' : 'border-white/20 hover:border-gold'}`}>{s}</button>)}
              </div>
            </div>
          )}
          {p.colors.length > 0 && (
            <div className="mt-6">
              <p className="font-display text-[11px] tracking-[0.3em] text-neutral-400">COLOUR</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.colors.map((c) => <button key={c} onClick={() => pickColor(c)} className={`flex items-center gap-2 rounded-sm border px-4 py-2 text-sm transition ${color === c ? 'border-gold bg-gold text-ink' : 'border-white/20 hover:border-gold'}`}>
                  <span className="h-3.5 w-3.5 rounded-full border border-white/40" style={{ background: swatch(c) }} />{c}{hasColourPhotos(c) && color !== c && <span className="text-[9px] tracking-wider text-gold">· PHOTOS</span>}</button>)}
              </div>
            </div>
          )}

          <a href={whatsappLink(msg)} target="_blank" rel="noreferrer" onClick={() => setSent(Date.now())}
            className="btn-sweep relative mt-10 flex w-full items-center justify-center gap-3 rounded-full bg-[#25D366] px-8 py-4 font-display text-xs font-semibold tracking-[0.25em] text-white transition hover:brightness-110">
            <MessageCircle className="h-5 w-5" /> ENQUIRE ON WHATSAPP
            {sent > 0 && <span key={sent} className="pop-tick absolute inset-0 flex items-center justify-center gap-2 rounded-full bg-gold text-ink"><Check className="h-5 w-5" /> OPENING WHATSAPP…</span>}
          </a>
          {chart && <SizeGuide charts={[chart]} open={guide} onClose={() => setGuide(false)} title={`Size guide · ${chart.name}`} />}
          <p className="mt-3 text-center text-xs text-neutral-500">No online checkout — we confirm availability, delivery and payment with you directly.</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <p data-reveal className="text-center font-display text-xs tracking-[0.4em] text-gold">YOU MAY ALSO LIKE</p>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">{related.map((r, i) => <div key={r.id} data-reveal style={delay(i * 110)}><ProductCard p={r} index={i} /></div>)}</div>
        </section>
      )}
    </main>
  );
}

/** A small colour dot for common colour names (falls back to grey). */
function swatch(name: string) {
  const n = name.toLowerCase();
  const map: Record<string, string> = { black: '#0B0B0B', white: '#F5F5F5', ivory: '#F7F4EC', cream: '#F3E9D2', beige: '#D9C7A3', sand: '#CBB892', gold: '#C9A24A', grey: '#8A8A8A', gray: '#8A8A8A', charcoal: '#333', navy: '#1B2A4A', blue: '#2E5BBA', royal: '#172C63', red: '#B3261E', maroon: '#6D1A1A', green: '#2E6B3F', olive: '#6B6B2E', brown: '#6B4A2E', pink: '#E8A0B4', purple: '#5E3A87', yellow: '#E5C93A', orange: '#E07A2E' };
  const key = Object.keys(map).find((k) => n.includes(k));
  return key ? map[key] : '#777';
}
