import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { asset } from '../lib/brand';
import { Button, errMsg } from '../components/ui';

/** Works two ways: (1) opened from the email link (already signed in), or (2) with the 6-digit code from the email. */
export default function ResetPassword() {
  const { session, clearRecovery } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { email?: string } };
  const [email, setEmail] = useState(loc.state?.email ?? '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsCode = !session;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    setBusy(true);
    try {
      if (needsCode) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
        if (error) throw error;
      }
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      clearRecovery();
      nav('/admin', { replace: true });
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  const input = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-ivory placeholder:text-neutral-500 outline-none focus:border-gold';
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <img src={asset('brand/logo-white.png')} alt="VANGELUX" className="mx-auto mb-6 w-56" />
        <h1 className="flex items-center justify-center gap-2 font-display text-lg text-gold"><KeyRound className="h-5 w-5" /> Set a new password</h1>
        {needsCode && (<>
          <input className={input} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} inputMode="numeric" required placeholder="6-digit code from email" value={code} onChange={(e) => setCode(e.target.value)} />
        </>)}
        <input className={input} type="password" autoComplete="new-password" required placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className={input} type="password" autoComplete="new-password" required placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button variant="gold" className="w-full" loading={busy} type="submit">Save password</Button>
      </form>
    </div>
  );
}
