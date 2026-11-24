import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { applySite } from '../lib/brand';
import { supabase, isConfigured } from '../lib/supabase';
import type { PublicCatalog } from '../lib/types';

interface CatalogState { catalog: PublicCatalog | null; loading: boolean; error: string; live: boolean; refresh: () => void }
const Ctx = createContext<CatalogState>({ catalog: null, loading: true, error: '', live: false, refresh: () => {} });
export const useCatalog = () => useContext(Ctx);

/**
 * Public catalogue, always read fresh from Supabase (never from a build file):
 *  1. Realtime: listens to the catalogue "signal" row which the database bumps on every product /
 *     image / tag / collection change, then re-fetches. Only a version number travels over realtime.
 *  2. Refreshes when the visitor returns to the tab/app or comes back online.
 *  3. Safety-net poll every 60 s in case a realtime connection silently drops.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const inflight = useRef(false);
  const queued = useRef(false);

  const fetchCatalog = useCallback(async () => {
    if (!isConfigured) { setLoading(false); setError('not-configured'); return; }
    if (inflight.current) { queued.current = true; return; }
    inflight.current = true;
    const { data, error } = await supabase.rpc('get_showroom_catalog');
    inflight.current = false;
    if (error) setError(error.message); else { applySite((data as PublicCatalog).site); setCatalog(data as PublicCatalog); setError(''); }
    setLoading(false);
    if (queued.current) { queued.current = false; fetchCatalog(); }
  }, []);

  useEffect(() => {
    fetchCatalog();
    if (!isConfigured) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(t); t = setTimeout(fetchCatalog, 300); };
    const channel = supabase.channel('showroom-catalog')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_signal' }, soon)
      .subscribe((status) => { setLive(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') soon(); });
    const onVis = () => document.visibilityState === 'visible' && soon();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', soon);
    window.addEventListener('online', soon);
    window.addEventListener('pageshow', soon);
    const poll = setInterval(() => document.visibilityState === 'visible' && fetchCatalog(), 60_000);
    return () => {
      clearTimeout(t); clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', soon); window.removeEventListener('online', soon); window.removeEventListener('pageshow', soon);
      supabase.removeChannel(channel);
    };
  }, [fetchCatalog]);

  return <Ctx.Provider value={{ catalog, loading, error, live, refresh: fetchCatalog }}>{children}</Ctx.Provider>;
}
