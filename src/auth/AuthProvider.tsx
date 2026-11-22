import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import type { StaffMember } from '../lib/types';

interface AuthState {
  session: Session | null;
  staff: StaffMember | null;
  loading: boolean;
  recovery: boolean;
  clearRecovery: () => void;
  signOut: () => Promise<void>;
  refreshStaff: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  // reset-password email links come back as ?recovery=1&code=… (outside the #hash route)
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).has('recovery'));

  async function loadStaff(s: Session | null) {
    if (!s) { setStaff(null); return; }
    const { data } = await supabase.rpc('my_staff_profile');
    setStaff(data && (data as StaffMember).user_id ? (data as StaffMember) : null);
  }

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadStaff(data.session);
      setLoading(false);
      if (window.location.search) {
        // tidy the address bar after Supabase consumed the auth code
        const hash = new URLSearchParams(window.location.search).has('recovery') ? '#/admin/reset-password' : window.location.hash;
        window.history.replaceState(null, '', window.location.pathname + hash);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); window.location.hash = '#/admin/reset-password'; }
      // defer DB call outside the auth callback (recommended by Supabase)
      setTimeout(() => loadStaff(s), 0);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <Ctx.Provider value={{
      session, staff, loading, recovery,
      clearRecovery: () => setRecovery(false),
      signOut: async () => { await supabase.auth.signOut(); setStaff(null); },
      refreshStaff: () => loadStaff(session),
    }}>
      {children}
    </Ctx.Provider>
  );
}
