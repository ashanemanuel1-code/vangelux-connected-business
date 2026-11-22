import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';

type Variant = 'primary' | 'gold' | 'ghost' | 'outline' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ivory hover:bg-charcoal',
  gold: 'bg-gold text-ink hover:bg-gold-light',
  ghost: 'text-ink hover:bg-black/5',
  outline: 'border border-neutral-300 bg-white text-ink hover:border-gold hover:text-gold-dark',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({ variant = 'primary', loading, className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-wide text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800', draft: 'bg-neutral-200 text-neutral-700', archived: 'bg-stone-300 text-stone-700',
  accepted: 'bg-emerald-100 text-emerald-800', sent: 'bg-sky-100 text-sky-800', rejected: 'bg-red-100 text-red-800', expired: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-amber-100 text-amber-800', unpaid: 'bg-red-100 text-red-800', refunded: 'bg-neutral-200 text-neutral-700',
  cancelled: 'bg-red-100 text-red-800', returned: 'bg-neutral-200 text-neutral-700', completed: 'bg-emerald-100 text-emerald-800', delivered: 'bg-emerald-100 text-emerald-800',
  available: 'bg-emerald-100 text-emerald-800', 'pre-launch': 'bg-amber-100 text-amber-800', discontinued: 'bg-neutral-200 text-neutral-600',
};
export function Badge({ children, tone, color }: { children: ReactNode; tone?: string; color?: string }) {
  if (color) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: color }}>{children}</span>;
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${badgeTones[tone ?? ''] ?? 'bg-neutral-100 text-neutral-700'}`}>{children}</span>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin text-gold" />{label}</div>;
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/60 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-gold">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-neutral-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[94vh] w-full flex-col rounded-t-2xl bg-ivory shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/5" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- toasts ----------
type Toast = { id: number; kind: 'ok' | 'error'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${t.kind === 'ok' ? 'bg-ink text-ivory' : 'bg-red-700 text-white'}`}>
            {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function errMsg(e: unknown): string {
  if (!e) return 'Something went wrong';
  if (typeof e === 'string') return e;
  const anyE = e as { message?: string; details?: string; hint?: string; code?: string };
  if (anyE.code === '23505') return 'That value already exists (must be unique). ' + (anyE.details ?? '');
  if (anyE.code === '42501') return 'You do not have permission to do that.';
  return anyE.message ?? 'Something went wrong';
}

export function confirmDialog(text: string) {
  return window.confirm(text);
}
