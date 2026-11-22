import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Loader2, Shirt } from 'lucide-react';
import { useCatalog } from './useCatalog';
import ProductCard, { mainImage } from './ProductCard';
import { mediaUrl } from '../lib/storage';
import { whatsappLink } from '../lib/brand';
import { money0, effectivePrice, num } from '../lib/format';

export default function ProductPage() {
  const { id } = useParams();
  const { catalog, loading } = useCatalog();
  const p = catalog?.products.find((x) => x.id === id);
  const [active, setActive] = useState<string | undefined>();
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    if (!p) return;
    // keep the selected image valid when the admin replaces images (live update)
    setActive((a) => (a && p.images.some((i) => i.path === a) ? a : mainImage(p)));
    setSize((s) => (s && p.sizes.includes(s) ? s : ''));
    setColor((c) => (c && p.colors.includes(c) ? c : p.colors.length === 1 ? p.colors[0] : ''));
  }, [p]);

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
        <div>
          <div className="aspect-[4/5] overflow-hidden rounded-sm bg-charcoal">
            {active ? <img src={mediaUrl(active)} alt={p.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-neutral-700"><Shirt className="h-16 w-16" /></div>}
          </div>
          {p.images.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {p.images.map((i) => (
                <button key={i.path} onClick={() => setActive(i.path)} className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-sm ${active === i.path ? 'ring-2 ring-gold' : 'opacity-70 hover:opacity-100'}`}>
                  <img src={mediaUrl(i.path)} alt="" className="h-full w-full object-cover" />
                  {i.kind !== 'detail' && <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] uppercase tracking-wider">{i.kind}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:pt-6">
          {p.collection_name && <p className="font-display text-xs tracking-[0.3em] text-gold">{p.collection_name}</p>}
          <h1 className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">{p.name}</h1>
          <p className="mt-2 text-sm text-neutral-500">{[p.category, p.fit_type, p.target_customer].filter(Boolean).join(' · ')}</p>
          <p className="mt-5 text-2xl font-semibold">{money0(price)}
            {num(p.discount_percent) > 0 && <span className="ml-3 text-base font-normal text-neutral-500 line-through">{money0(p.selling_price)}</span>}</p>
          {p.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t.name} className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: t.color }}>{t.name}</span>)}</div>}

          {p.description && <p className="mt-6 whitespace-pre-line leading-relaxed text-neutral-300">{p.description}</p>}

          {p.sizes.length > 0 && (
            <div className="mt-8">
              <p className="font-display text-[11px] tracking-[0.3em] text-neutral-400">SELECT SIZE</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.sizes.map((s) => <button key={s} onClick={() => setSize(size === s ? '' : s)} className={`min-w-12 rounded-sm border px-4 py-2.5 text-sm transition ${size === s ? 'border-gold bg-gold text-ink' : 'border-white/20 hover:border-gold'}`}>{s}</button>)}
              </div>
            </div>
          )}
          {p.colors.length > 0 && (
            <div className="mt-6">
              <p className="font-display text-[11px] tracking-[0.3em] text-neutral-400">COLOUR</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.colors.map((c) => <button key={c} onClick={() => setColor(color === c ? '' : c)} className={`rounded-sm border px-4 py-2 text-sm ${color === c ? 'border-gold bg-gold text-ink' : 'border-white/20 hover:border-gold'}`}>{c}</button>)}
              </div>
            </div>
          )}

          <a href={whatsappLink(msg)} target="_blank" rel="noreferrer"
            className="mt-10 flex w-full items-center justify-center gap-3 rounded-full bg-[#25D366] px-8 py-4 font-display text-xs font-semibold tracking-[0.25em] text-white transition hover:brightness-110">
            <MessageCircle className="h-5 w-5" /> ENQUIRE ON WHATSAPP
          </a>
          <p className="mt-3 text-center text-xs text-neutral-500">No online checkout — we confirm availability, delivery and payment with you directly.</p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-24">
          <p className="text-center font-display text-xs tracking-[0.4em] text-gold">YOU MAY ALSO LIKE</p>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
        </section>
      )}
    </main>
  );
}
