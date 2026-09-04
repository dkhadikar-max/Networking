'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';
import { safeNext, withNext } from '@/lib/authRedirect';

// Mandatory step after a magic-link signup, before onboarding continues —
// magic link is scoped to signup only; every login after this uses the
// real password set here (OTP remains available as a fallback on that
// login, unchanged). Reached only when the authenticated user's
// password_set is false (see AuthContext-driven redirect on /verify-magic);
// not linked from anywhere else, and /api/auth/set-password itself refuses
// to run again once password_set is true.
function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const { user, setUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Password min 8 chars'); return; }
    if (password !== confirm) { setError('Passwords don’t match'); return; }
    setError(''); setLoading(true);
    try {
      await apiPost('/api/auth/set-password', { password });
      if (user) setUser({ ...user, password_set: true });
      if (user?.onboarding_stage === 'complete') router.replace(safeNext(next));
      else router.replace(withNext('/onboarding', next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Set a password</h1>
            <p className="text-sm text-[var(--sub)] mt-1">
              You signed up with an email link. Set a password now so you can sign in directly next time.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            />
            <Button type="submit" loading={loading} fullWidth>Continue</Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    }>
      <SetPasswordInner />
    </Suspense>
  );
}
