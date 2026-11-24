import { useEffect, useState } from 'react';
import { useCatalog } from './useCatalog';
import { X, Ruler } from 'lucide-react';
import { mediaUrl } from '../lib/storage';
import type { PublicSizeChart } from '../lib/types';

/** Full-screen size guide for customers. Tap a chart to open it full size (pinch to zoom on phones). */
export function SizeGuide({ charts, open, onClose, title = 'Size guide' }: { charts: PublicSizeChart[]; open: boolean; onClose: () => void; title?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-gold/30 bg-ink text-ivory sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-ink/95 px-5 py-4 backdrop-blur">
          <p className="flex items-center gap-2 font-display text-sm tracking-[0.25em] text-gold"><Ruler className="h-4 w-4" /> {title.toUpperCase()}</p>
          <button onClick={onClose} aria-label="Close" className="p-1 text-neutral-300 hover:text-gold"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-8 p-5">
          {charts.map((c) => (
            <figure key={c.id}>
              {charts.length > 1 && <figcaption className="mb-2 font-display text-xs tracking-[0.25em] text-neutral-300">{c.name.toUpperCase()}</figcaption>}
              <a href={mediaUrl(c.image_path)} target="_blank" rel="noreferrer" title="Open full size">
                <img src={mediaUrl(c.image_path)} alt={`${c.name} size chart`} className="w-full rounded-lg bg-white object-contain" />
              </a>
              {c.notes && <p className="mt-3 whitespace-pre-line text-sm text-neutral-300">{c.notes}</p>}
            </figure>
          ))}
          <p className="text-center text-xs text-neutral-500">Tap a chart to open it full size. Not sure? Ask us on WhatsApp — we'll help you pick.</p>
        </div>
      </div>
    </div>
  );
}

/** "Size guide" link for the showroom footer — shows every published chart. Hidden if there are none. */
export function SizeGuideLink() {
  const { catalog } = useCatalog();
  const [open, setOpen] = useState(false);
  const charts = catalog?.size_charts ?? [];
  if (!charts.length) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-4 flex items-center gap-2 text-sm text-gold hover:underline"><Ruler className="h-4 w-4" /> Size guide</button>
      <SizeGuide charts={charts} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
