import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shirt } from 'lucide-react';
import { mediaUrl } from '../lib/storage';
import { money0, effectivePrice, num } from '../lib/format';
import type { PublicProduct } from '../lib/types';
import { useTilt, useInView, reducedMotion } from './motion';

export function mainImage(p: PublicProduct) {
  return (p.images.find((i) => i.is_main) ?? p.images.find((i) => i.kind === 'front') ?? p.images[0])?.path;
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;

export default function ProductCard({ p, index = 0 }: { p: PublicProduct; index?: number }) {
  const img = mainImage(p);
  const back = p.images.find((i) => i.kind === 'back' && i.path !== img)?.path;
  const price = effectivePrice(p.selling_price, p.discount_percent);
  const tilt = useTilt<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLAnchorElement>();
  const [flipped, setFlipped] = useState(false);

  // Phones have no hover: while the card is on screen, gently swap between front and back designs.
  useEffect(() => {
    if (!back || !inView || !isTouch() || reducedMotion()) { setFlipped(false); return; }
    let t: ReturnType<typeof setInterval>;
    const start = setTimeout(() => { setFlipped(true); t = setInterval(() => setFlipped((f) => !f), 3200); }, 1400 + (index % 4) * 450);
    return () => { clearTimeout(start); clearInterval(t); };
  }, [back, inView, index]);

  return (
    <Link ref={viewRef} to={`/product/${p.id}`} className="group block">
      <div ref={tilt} className="tilt relative aspect-[4/5] overflow-hidden rounded-sm bg-charcoal ring-1 ring-white/5 transition-shadow duration-500 group-hover:shadow-[0_20px_50px_-20px_rgba(201,162,74,0.45)]">
        {img ? <>
          <img src={mediaUrl(img)} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${back ? 'group-hover:opacity-0' : ''} ${flipped ? 'opacity-0' : ''}`} />
          {back && <img src={mediaUrl(back)} alt="" loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-100 ${flipped ? 'opacity-100' : 'opacity-0'}`} />}
          {back && <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 font-display text-[9px] tracking-[0.2em] text-gold opacity-0 transition duration-500 group-hover:opacity-100" style={flipped ? { opacity: 1 } : undefined}>{flipped ? 'BACK' : 'HOVER FOR BACK'}</span>}
        </> : <div className="flex h-full items-center justify-center text-neutral-700"><Shirt className="h-12 w-12" /></div>}
        <div className="tilt-glare" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {p.tags.slice(0, 3).map((t) => <span key={t.name} className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: t.color }}>{t.name}</span>)}
        </div>
      </div>
      <div className="mt-4 space-y-1">
        {p.collection_name && <p className="font-display text-[10px] tracking-[0.25em] text-gold">{p.collection_name}</p>}
        <h3 className="font-display text-base tracking-wide text-ivory transition-colors group-hover:text-gold-light">{p.name}</h3>
        <p className="text-xs text-neutral-500">{[p.category, p.fit_type].filter(Boolean).join(' · ')}</p>
        {p.sizes.length > 0 && <p className="text-[11px] tracking-wider text-neutral-400">{p.sizes.join(' · ')}</p>}
        <p className="pt-1 text-sm font-semibold text-ivory">
          {money0(price)}
          {num(p.discount_percent) > 0 && <span className="ml-2 text-xs font-normal text-neutral-500 line-through">{money0(p.selling_price)}</span>}
        </p>
      </div>
    </Link>
  );
}
