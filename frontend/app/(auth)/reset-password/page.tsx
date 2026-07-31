'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword: password,
      });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired reset code.');
    } finally {
      setLoading(false);
    }
  }

  const shell = (content: React.ReactNode) => (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>{content}</div>
    </div>
  );

  if (done) {
    return shell(
      <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[var(--text)]">Password reset</h1>
        <p className="text-sm text-[var(--sub)]">Your password has been updated. Redirecting you to sign in…</p>
      </div>
    );
  }

  return shell(
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Reset your password</h1>
        <p className="text-sm text-[var(--sub)] mt-1">Enter the 6-digit code from your email and choose a new password.</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Reset code</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus={!!params.get('email')}
            placeholder="123456"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">New password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            placeholder="Repeat your new password"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>

        <Button type="submit" loading={loading} fullWidth>Reset password</Button>
      </form>

      <p className="text-center text-sm text-[var(--sub)]">
        <Link href="/forgot-password" className="text-[var(--primary)] font-semibold hover:underline">Request a new code</Link>
        {' · '}
        <Link href="/login" className="text-[var(--primary)] font-semibold hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
