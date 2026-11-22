import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Re-run `onChange` whenever any of the given tables change (from ANY device),
 * and whenever the user comes back to the tab/app. Debounced.
 */
export function useLiveRefresh(tables: string[], onChange: () => void, opts: { pollMs?: number } = {}) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 250); };

    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire);
    }
    channel.subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible') fire(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fire);
    window.addEventListener('online', fire);
    const poll = opts.pollMs ? setInterval(() => { if (document.visibilityState === 'visible') fire(); }, opts.pollMs) : undefined;

    return () => {
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fire);
      window.removeEventListener('online', fire);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.pollMs]);
}
