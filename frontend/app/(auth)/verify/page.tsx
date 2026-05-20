'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';

export default function VerifyPage() {
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await apiPost('/api/auth/verify-otp', { code: otp });
      const updated = await refreshUser();
      if (updated?.onboarding_stage === 'complete') {
        router.replace('/discover');
      } else {
        router.replace('/onboarding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally { setLoading(false); }
  }

  async function handleResend() {
    setResending(true); setResent(false); setResendError('');
    try {
      await apiPost('/api/auth/send-otp', {});
      setResent(true);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Failed to send code');
    } finally { setResending(false); }
  }

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Verify your email</h1>
        <p className="text-sm text-[var(--sub)] mt-1">We sent a 6-digit code to your email. Enter it below.</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}
      {resent && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">Code resent — check your inbox.</div>
      )}
      {resendError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{resendError}</div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            required
            placeholder="123456"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>
        <Button type="submit" loading={loading} fullWidth>Verify email</Button>
      </form>

      <p className="text-center text-sm text-[var(--sub)]">
        Didn&apos;t get the code?{' '}
        <button
          onClick={handleResend}
          disabled={resending}
          className="text-[var(--primary)] font-semibold hover:underline disabled:opacity-40"
        >
          {resending ? 'Sending…' : 'Resend'}
        </button>
      </p>
    </div>
  );
}
