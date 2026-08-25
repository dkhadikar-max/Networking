'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';

const RESEND_COOLDOWN_S = 60;

// Server error codes (server.js, /api/auth/send-otp) mapped to the exact
// user-facing copy specified in docs/email-verification-audit-2026-08-15.md.
// Falls back to the server's own message for anything unmapped.
function resendErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'COOLDOWN':          return 'Please wait before requesting another';
    case 'TOO_MANY_ATTEMPTS': return 'Too many attempts';
    case 'EMAIL_UNREACHABLE': return 'This email could not receive mail';
    case 'EMAIL_SERVICE_DOWN':return 'Email service temporarily unavailable';
    default:                  return err instanceof Error ? err.message : 'Failed to send code';
  }
}

function VerifyForm() {
  const { refreshUser, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email');
  const targetEmail = emailParam || user?.email;

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(s => {
        if (s <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

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
    if (cooldown > 0 || resending) return;
    setResending(true); setResent(false); setResendError('');
    try {
      await apiPost('/api/auth/send-otp', {});
      setResent(true);
      // Client-side cooldown mirrors the server's — this is a UX affordance
      // (instant feedback, no wasted round-trip) layered on top of the real
      // enforcement, which is server-side and DB-backed (issueAndSendOtp in
      // server.js) since a client-side-only cooldown is trivially bypassed
      // by a second tab, a fresh page load, or a direct API call.
      startCooldown();
    } catch (err) {
      setResendError(resendErrorMessage(err));
      // A blocked attempt still tells the user roughly how long to wait,
      // even though the server (not this timer) is the actual enforcement.
      const code = (err as { code?: string })?.code;
      if (code === 'COOLDOWN') startCooldown();
    } finally { setResending(false); }
  }

  // Web has no device-trust concept (unlike the mobile apps, which
  // legitimately re-trigger OTP on a new device even when email_verified is
  // already true server-side — see the NOTE in server.js's send-otp route).
  // A verified web session landing here has nothing left to do; resending
  // would just be a wasted send. Only applies once AuthContext has actually
  // loaded a verified user — a fresh signup redirect (user briefly null/
  // unverified while the context settles) falls through to the normal form.
  if (user?.email_verified) {
    return (
      <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-4 text-center">
        <h1 className="text-2xl font-bold text-[var(--text)]">Your email is already verified</h1>
        <p className="text-sm text-[var(--sub)]">There&apos;s nothing left to confirm here.</p>
        <Button type="button" onClick={() => router.replace('/discover')} fullWidth>Continue →</Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Verify your email</h1>
        <p className="text-sm text-[var(--sub)] mt-1">
          We sent a 6-digit code to{' '}
          {targetEmail ? (
            <strong className="font-semibold text-[var(--text)]">{targetEmail}</strong>
          ) : (
            'your email'
          )}
          . Enter it below.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}
      {resent && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">Email sent — check your inbox.</div>
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
          disabled={resending || cooldown > 0}
          className="text-[var(--primary)] font-semibold hover:underline disabled:opacity-40"
        >
          {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
        </button>
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 text-center text-sm text-[var(--sub)]">
            Loading verification…
          </div>
        }>
          <VerifyForm />
        </Suspense>
      </div>
    </div>
  );
}
