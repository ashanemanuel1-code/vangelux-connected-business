import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Spinner, Button } from '../components/ui';

export function RequireStaff({ children }: { children: ReactNode }) {
  const { session, staff, loading, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen bg-ivory"><Spinner label="Checking your session…" /></div>;
  if (!session) return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  if (!staff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink p-6 text-ivory">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-gold" />
          <h1 className="mt-4 font-display text-xl">Access not authorised</h1>
          <p className="mt-2 text-sm text-neutral-400">
            You are signed in as <b>{session.user.email}</b>, but this account is not on the VANGELUX staff list.
            The owner must add it (see docs/ADMIN_SETUP.md).
          </p>
          <Button variant="gold" className="mt-6" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
