import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, Shirt } from 'lucide-react';
import { mediaUrl } from '../lib/storage';

type Img = { path: string; kind: string };

/**
 * Product photo gallery:
 * - swipe left/right on phones, arrows on computers, thumbnails below
 * - tap the photo to open it full screen; tap again (or double-tap) to zoom into the print, drag to look around
 */
export function Gallery({ images, active, onChange, alt }: { images: Img[]; active?: string; onChange: (path: string) => void; alt: string }) {
  const idx = Math.max(0, images.findIndex((i) => i.path === active));
  const go = (d: number) => images.length && onChange(images[(idx + d + images.length) % images.length].path);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  const swipeStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const swipeEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
  };

  return (
    <div>
      <div className="group relative aspect-[4/5] overflow-hidden rounded-sm bg-charcoal" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
        {active ? (
          <button className="block h-full w-full cursor-zoom-in" onClick={() => setZoomOpen(true)} aria-label="Open photo full screen">
            <img key={active} src={mediaUrl(active)} alt={alt} className="page-in h-full w-full object-cover" style={{ animationDuration: '.45s' }} />
          </button>
        ) : <div className="flex h-full items-center justify-center text-neutral-700"><Shirt className="h-16 w-16" /></div>}
        {images.length > 1 && <>
          <button onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-ivory opacity-0 transition group-hover:opacity-100 hover:bg-gold hover:text-ink md:block"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={() => go(1)} aria-label="Next photo" className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/50 p-2 text-ivory opacity-0 transition group-hover:opacity-100 hover:bg-gold hover:text-ink md:block"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((i) => <span key={i.path} className={`h-1.5 rounded-full transition-all duration-300 ${i.path === active ? 'w-5 bg-gold' : 'w-1.5 bg-white/50'}`} />)}
          </div>
        </>}
        {active && <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] tracking-wider text-ivory opacity-80"><ZoomIn className="h-3 w-3" /> TAP TO ZOOM</span>}
      </div>

      {images.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {images.map((i) => (
            <button key={i.path} onClick={() => onChange(i.path)} className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-sm transition ${active === i.path ? 'ring-2 ring-gold' : 'opacity-60 hover:opacity-100'}`}>
              <img src={mediaUrl(i.path)} alt="" className="h-full w-full object-cover" />
              {i.kind !== 'detail' && <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] uppercase tracking-wider">{i.kind}</span>}
            </button>
          ))}
        </div>
      )}

      {zoomOpen && active && <ZoomView images={images} start={idx} alt={alt} onClose={() => setZoomOpen(false)} onChange={onChange} />}
    </div>
  );
}

function ZoomView({ images, start, alt, onClose, onChange }: { images: Img[]; start: number; alt: string; onClose: () => void; onChange: (p: string) => void }) {
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const img = images[i];

  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', key); };
  });
  const step = (d: number) => { const n = (i + d + images.length) % images.length; setI(n); setZoomed(false); onChange(images[n].path); };

  function toggleZoom(e: React.MouseEvent) {
    if (drag.current?.moved) return;
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    const z = !zoomed; setZoomed(z);
    if (z) requestAnimationFrame(() => { el.scrollLeft = fx * el.scrollWidth - r.width / 2; el.scrollTop = fy * el.scrollHeight - r.height / 2; });
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 page-in" role="dialog" aria-modal="true" aria-label="Photo viewer" style={{ animationDuration: '.3s' }}>
      <div ref={box} className={`no-scrollbar h-full w-full ${zoomed ? 'cursor-grab overflow-auto' : 'flex items-center justify-center overflow-hidden'}`}
        onMouseDown={(e) => { if (!zoomed || !box.current) return; drag.current = { x: e.clientX, y: e.clientY, sl: box.current.scrollLeft, st: box.current.scrollTop, moved: false }; }}
        onMouseMove={(e) => { const d = drag.current; if (!d || !box.current) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true; box.current.scrollLeft = d.sl - (e.clientX - d.x); box.current.scrollTop = d.st - (e.clientY - d.y); }}
        onMouseUp={() => setTimeout(() => { drag.current = null; }, 0)}
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => { const s = touch.current; touch.current = null; if (!s || zoomed) return; const dx = e.changedTouches[0].clientX - s.x; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }}
        onClick={toggleZoom}>
        <img src={mediaUrl(img.path)} alt={alt} draggable={false}
          className={`select-none transition-[width,max-width] duration-300 ${zoomed ? 'max-w-none' : 'max-h-full max-w-full cursor-zoom-in object-contain'}`}
          style={zoomed ? { width: '220%' } : undefined} />
      </div>
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-ivory hover:text-gold" style={{ marginTop: 'env(safe-area-inset-top)' }}><X className="h-6 w-6" /></button>
      {images.length > 1 && <>
        <button onClick={() => step(-1)} aria-label="Previous" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-ivory hover:text-gold"><ChevronLeft className="h-6 w-6" /></button>
        <button onClick={() => step(1)} aria-label="Next" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-ivory hover:text-gold"><ChevronRight className="h-6 w-6" /></button>
      </>}
      <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[11px] tracking-[0.2em] text-neutral-400">{zoomed ? 'DRAG TO LOOK AROUND · TAP TO ZOOM OUT' : `TAP TO ZOOM · ${i + 1} / ${images.length}`}</p>
    </div>
  );
}
