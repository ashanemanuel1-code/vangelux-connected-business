import { Link } from 'react-router-dom';
import { Shirt } from 'lucide-react';
import { mediaUrl } from '../lib/storage';
import { money0, effectivePrice, num } from '../lib/format';
import type { PublicProduct } from '../lib/types';

export function mainImage(p: PublicProduct) {
  return (p.images.find((i) => i.is_main) ?? p.images.find((i) => i.kind === 'front') ?? p.images[0])?.path;
}

export default function ProductCard({ p }: { p: PublicProduct }) {
  const img = mainImage(p);
  const back = p.images.find((i) => i.kind === 'back' && i.path !== img)?.path;
  const price = effectivePrice(p.selling_price, p.discount_percent);
  return (
    <Link to={`/product/${p.id}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-charcoal">
        {img ? <>
          <img src={mediaUrl(img)} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${back ? 'group-hover:opacity-0' : ''}`} />
          {back && <img src={mediaUrl(back)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-700 group-hover:opacity-100" />}
        </> : <div className="flex h-full items-center justify-center text-neutral-700"><Shirt className="h-12 w-12" /></div>}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {p.tags.slice(0, 3).map((t) => <span key={t.name} className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white" style={{ background: t.color }}>{t.name}</span>)}
        </div>
      </div>
      <div className="mt-4 space-y-1">
        {p.collection_name && <p className="font-display text-[10px] tracking-[0.25em] text-gold">{p.collection_name}</p>}
        <h3 className="font-display text-base tracking-wide text-ivory group-hover:text-gold-light">{p.name}</h3>
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
