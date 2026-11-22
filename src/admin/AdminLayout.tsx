import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard, Shirt, Layers, FileText, ShoppingBag, Receipt, Boxes, Users, Settings as SettingsIcon,
  LogOut, Menu, X, ExternalLink, ClipboardList,
} from 'lucide-react';
import { useFulfilment } from '../lib/fulfilment';
import { useAuth } from '../auth/AuthProvider';
import { asset } from '../lib/brand';

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Shirt },
  { to: '/admin/collections', label: 'Collections', icon: Layers },
  { to: '/admin/quotations', label: 'Quotations', icon: FileText },
  { to: '/admin/sales', label: 'Sales', icon: ShoppingBag },
  { to: '/admin/to-order', label: 'To order', icon: ClipboardList },
  { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/settings', label: 'Settings & Tags', icon: SettingsIcon },
];
const mobileNav = [nav[0], nav[3], nav[4], nav[5]]; // Dashboard, Quotations, Sales, To order

export default function AdminLayout() {
  const { staff, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const fl = useFulfilment();
  // Menu badges: amber = pieces you need to order, green = orders ready to hand over.
  const badge = (to: string) => to !== '/admin/to-order' ? null : (
    <span className="ml-auto flex gap-1">
      {fl.piecesToOrder > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-ink">{fl.piecesToOrder}</span>}
      {fl.ready.length > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-4 text-ink">{fl.ready.length}</span>}
    </span>
  );

  const links = (onClick?: () => void) => nav.map(({ to, label, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} onClick={onClick}
      className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-gold/15 text-gold' : 'text-neutral-300 hover:bg-white/5 hover:text-ivory'}`}>
      <Icon className="h-4.5 w-4.5" /> {label}{badge(to)}
    </NavLink>
  ));

  const footer = (
    <div className="border-t border-white/10 p-3 text-xs text-neutral-400">
      <p className="truncate px-3">{staff?.email}</p>
      <p className="px-3 capitalize text-gold/80">{staff?.role}</p>
      <Link to="/" target="_blank" className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 hover:text-ivory"><ExternalLink className="h-4 w-4" /> Public showroom</Link>
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 hover:text-ivory"><LogOut className="h-4 w-4" /> Sign out</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-ivory lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink lg:flex">
        <Link to="/admin" className="px-6 pb-4 pt-6"><img src={asset('brand/logo-white.png')} alt="VANGELUX" className="w-40" /><p className="mt-2 font-display text-[10px] tracking-[0.4em] text-gold">ADMIN</p></Link>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">{links()}</nav>
        {footer}
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <Link to="/admin"><img src={asset('brand/logo-white.png')} alt="VANGELUX" className="h-7" /></Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ivory" aria-label="Menu"><Menu className="h-5 w-5" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="absolute inset-y-0 right-0 flex w-72 flex-col bg-ink" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4"><span className="font-display text-sm tracking-[0.3em] text-gold">MENU</span>
              <button onClick={() => setOpen(false)} className="p-1 text-ivory"><X className="h-5 w-5" /></button></div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3">{links(() => setOpen(false))}</nav>
            {footer}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8"><Outlet /></main>

      {/* mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 bg-ink lg:hidden">
        {mobileNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[10px] ${isActive ? 'text-gold' : 'text-neutral-400'}`}>
            <span className="relative"><Icon className="h-5 w-5" />{to === '/admin/to-order' && fl.piecesToOrder + fl.ready.length > 0 && <span className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />}</span>{label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-neutral-400"><Menu className="h-5 w-5" />More</button>
      </nav>
    </div>
  );
}
