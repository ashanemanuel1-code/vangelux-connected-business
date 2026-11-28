import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Mail, MessageCircle, Menu, X } from 'lucide-react';
import { InstagramIcon as Instagram, FacebookIcon as Facebook, TikTokIcon as TikTok } from '../components/SocialIcons';
import { CatalogProvider, useCatalog } from './useCatalog';
import { useScrollReveal, Splash } from './motion';
import { LaunchBanner } from './Launches';
import { SizeGuideLink } from './SizeGuide';
import { asset, whatsappLink, useSite } from '../lib/brand';

export default function ShowroomLayout() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const site = useSite();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 30); f(); window.addEventListener('scroll', f); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => { setOpen(false); }, [loc]);
  useScrollReveal();

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault(); setOpen(false);
    if (loc.pathname !== '/') { window.location.hash = '#/'; setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 350); }
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  const links = [['collections', 'Collections'], ['shop', 'Shop'], ['story', 'Our story'], ['contact', 'Contact']] as const;

  return (
    <CatalogProvider>
      <div className="min-h-screen bg-ink text-ivory">
        <SplashWhenReady />
        <header className={`fixed inset-x-0 top-0 z-40 transition ${scrolled || loc.pathname !== '/' ? 'bg-ink/95 shadow-lg backdrop-blur' : 'bg-transparent'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <LaunchBannerFromCatalog />
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
            <Link to="/" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><img src={asset('brand/logo-white.png')} alt="VANGELUX" className="h-9 sm:h-10" /></Link>
            <nav className="hidden items-center gap-8 md:flex">
              {links.map(([id, l]) => <a key={id} href={`#${id}`} onClick={go(id)} className="font-display text-xs tracking-[0.25em] text-neutral-300 transition hover:text-gold">{l.toUpperCase()}</a>)}
              <a href={whatsappLink('Hi VANGELUX! I would like to know more about your collection.')} target="_blank" rel="noreferrer" className="btn-sweep rounded-full border border-gold px-4 py-2 font-display text-[11px] tracking-[0.2em] text-gold transition hover:bg-gold hover:text-ink">ENQUIRE</a>
            </nav>
            <button className="p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
          </div>
          {open && (
            <nav className="border-t border-white/10 bg-ink px-5 pb-5 md:hidden">
              {links.map(([id, l]) => <a key={id} href={`#${id}`} onClick={go(id)} className="block py-3 font-display text-sm tracking-[0.25em] text-neutral-200">{l.toUpperCase()}</a>)}
            </nav>
          )}
        </header>

        <div key={loc.pathname} className="page-in"><Outlet /></div>

        <footer id="contact" className="border-t border-gold/20 bg-ink">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-3">
            <div>
              <img src={asset('brand/logo-white.png')} alt="VANGELUX" className="w-56" />
              <p className="mt-4 max-w-xs whitespace-pre-line text-sm text-neutral-400">{site.footerAbout}</p>
            </div>
            <div>
              <p className="font-display text-xs tracking-[0.3em] text-gold">CONTACT</p>
              <ul className="mt-4 space-y-3 text-sm text-neutral-300">
                <li><a href={`https://wa.me/${site.whatsappNumber}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold"><MessageCircle className="h-4 w-4" /> WhatsApp {site.whatsappDisplay}</a></li>
                <li><a href={`mailto:${site.email}`} className="flex items-center gap-3 break-all hover:text-gold"><Mail className="h-4 w-4 shrink-0" /> {site.email}</a></li>
                {site.instagram && <li><a href={site.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold"><Instagram className="h-4 w-4" /> {site.instagramHandle || 'Instagram'}</a></li>}
                {site.facebook && <li><a href={site.facebook} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold"><Facebook className="h-4 w-4" /> {site.facebookLabel || 'Facebook'}</a></li>}
                {site.tiktok && <li><a href={site.tiktok} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:text-gold"><TikTok className="h-4 w-4" /> {site.tiktokHandle || 'TikTok'}</a></li>}
              </ul>
            </div>
            <div>
              <p className="font-display text-xs tracking-[0.3em] text-gold">HOW TO ORDER</p>
              <p className="mt-4 whitespace-pre-line text-sm text-neutral-400">{site.howToOrder}</p>
              <SizeGuideLink />
            </div>
          </div>
          <div className="border-t border-white/5 py-6 text-center text-[11px] tracking-[0.25em] text-neutral-500">
            © {new Date().getFullYear()} VANGELUX · {site.tagline.toUpperCase()}
          </div>
        </footer>

        <a href={whatsappLink('Hi VANGELUX! I have an enquiry.')} target="_blank" rel="noreferrer" aria-label="WhatsApp"
          className="wa-pulse fixed bottom-5 right-5 z-40 isolate flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition hover:scale-110" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <MessageCircle className="h-7 w-7" />
        </a>
      </div>
    </CatalogProvider>
  );
}

/** Loading screen until the catalogue is ready (first visit only). */
function SplashWhenReady() {
  const { loading } = useCatalog();
  return <Splash ready={!loading} />;
}

/** Slim gold countdown banner at the top (from Admin → Countdowns). */
function LaunchBannerFromCatalog() {
  const { catalog } = useCatalog();
  return <LaunchBanner launches={catalog?.launches ?? []} />;
}
