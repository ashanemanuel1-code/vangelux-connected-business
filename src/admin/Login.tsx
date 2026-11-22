import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { supabase, isConfigured } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { asset } from '../lib/brand';
import { Button, errMsg } from '../components/ui';

export default function Login() {
  const { session, staff, loading } = useAuth();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [info, setInfo] = useState('');

  if (!loading && session && staff) return <Navigate to={loc.state?.from ?? '/admin'} replace />;

  async function onLogin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : errMsg(error));
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setInfo('');
    const redirectTo = `${window.location.origin}${window.location.pathname}?recovery=1`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    if (error) setError(errMsg(error));
    else setInfo('If this email belongs to an administrator, a reset email is on its way. Open the link, or enter the 6-digit code on the next screen.');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-5 py-10">
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at top, #C9A24A33, transparent 60%)' }} />
      <div className="relative w-full max-w-sm">
        <img src={asset('brand/logo-white.png')} alt="VANGELUX" className="mx-auto w-64" />
        <div className="gold-rule my-6" />
        <p className="text-center font-display text-sm tracking-[0.35em] text-gold">ADMIN</p>

        {!isConfigured && (
          <p className="mt-6 rounded-lg bg-amber-500/15 p-3 text-xs text-amber-200">
            Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).
          </p>
        )}

        <form onSubmit={mode === 'login' ? onLogin : onForgot} className="mt-6 space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
            <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-ivory placeholder:text-neutral-500 outline-none focus:border-gold" />
          </div>
          {mode === 'login' && (
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
              <input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-3 text-sm text-ivory placeholder:text-neutral-500 outline-none focus:border-gold" />
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-300">{info}</p>}
          <Button variant="gold" type="submit" loading={busy} className="w-full">{mode === 'login' ? 'Sign in' : 'Send reset email'}</Button>
        </form>

        <div className="mt-4 flex justify-between text-xs text-neutral-400">
          {mode === 'login'
            ? <button onClick={() => { setMode('forgot'); setError(''); }} className="hover:text-gold">Forgot password?</button>
            : <button onClick={() => { setMode('login'); setInfo(''); }} className="hover:text-gold">Back to sign in</button>}
          {mode === 'forgot' && info
            ? <Link to="/admin/reset-password" state={{ email }} className="text-gold">I have a code →</Link>
            : <Link to="/" className="hover:text-gold">View showroom</Link>}
        </div>
      </div>
    </div>
  );
}
