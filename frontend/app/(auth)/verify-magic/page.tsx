'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';
import type { User } from '@/lib/types';

const OTP_COOLDOWN_S = 60;

// Server error codes -> exact required user-facing states.
function linkErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'EXPIRED':           return 'Link expired';
    case 'ALREADY_USED':      return 'Link already used';
    case 'EMAIL_SERVICE_DOWN':return 'Email service temporarily unavailable';
    default:                  return 'Invalid link';
  }
}
function otpErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'COOLDOWN':           return 'Please wait before requesting another';
    case 'TOO_MANY_ATTEMPTS':  return 'Too many attempts';
    case 'IP_BLOCKED':         return err instanceof Error ? err.message : 'Too many attempts';
    case 'EMAIL_SERVICE_DOWN': return 'Email service temporarily unavailable';
    default:                   return err instanceof Error ? err.message : 'Failed to send code';
  }
}

function routeAfterAuth(router: ReturnType<typeof useRouter>, user: User) {
  // Magic-link signups must set a real password before continuing — takes
  // priority over the normal onboarding/discover split.
  if (user.password_set === false) { router.replace('/set-password'); return; }
  if (user.onboarding_stage === 'complete') router.replace('/discover');
  else router.replace('/onboarding');
}

function VerifyMagicInner() {
  const router = useRouter();
  const { setUser } = useAuth();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const fallbackParam = searchParams.get('fallback') === '1';
  const emailParam = searchParams.get('email') || '';

  // Link-verification state (only relevant when a token is present).
  const [linkStatus, setLinkStatus] = useState<'checking' | 'error' | 'idle'>(token ? 'checking' : 'idle');
  const [linkError, setLinkError] = useState('');

  // OTP-fallback state — shown when there's no token, ?fallback=1 was
  // passed, or the link failed to verify.
  const [showFallback, setShowFallback] = useState(fallbackParam || !token);
  const [fbEmail, setFbEmail] = useState(emailParam);
  const [fbCode, setFbCode] = useState('');
  const [fbStage, setFbStage] = useState<'email' | 'code'>(emailParam ? 'code' : 'email');
  const [fbSending, setFbSending] = useState(false);
  const [fbVerifying, setFbVerifying] = useState(false);
  const [fbError, setFbError] = useState('');
  const [fbSent, setFbSent] = useState(false);
  const [fbCooldown, setFbCooldown] = useState(0);
  const fbCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (fbCooldownRef.current) clearInterval(fbCooldownRef.current); }, []);

  function startFbCooldown() {
    setFbCooldown(OTP_COOLDOWN_S);
    if (fbCooldownRef.current) clearInterval(fbCooldownRef.current);
    fbCooldownRef.current = setInterval(() => {
      setFbCooldown(s => {
        if (s <= 1) { if (fbCooldownRef.current) clearInterval(fbCooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  const verifyLink = useCallback(async (rawToken: string) => {
    try {
      const res = await apiPost<{ user: User }>('/api/auth/magic-link/verify', { token: rawToken });
      setUser(res.user);
      // Strip the token from the URL/history immediately on success too —
      // it's single-use and now spent either way.
      router.replace('/verify-magic');
      routeAfterAuth(router, res.user);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setLinkError(linkErrorMessage(code));
      setLinkStatus('error');
      setShowFallback(true);
      // Remove the token from the visible URL/history even on failure —
      // no reason a spent or invalid token should linger there.
      router.replace('/verify-magic');
    }
  }, [router, setUser]);

  useEffect(() => {
    if (token) verifyLink(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFbSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (fbCooldown > 0 || fbSending) return;
    setFbError(''); setFbSending(true);
    try {
      await apiPost('/api/auth/passwordless/otp/request', { email: fbEmail });
      setFbSent(true);
      setFbStage('code');
      startFbCooldown();
    } catch (err) {
      setFbError(otpErrorMessage(err));
      const code = (err as { code?: string })?.code;
      if (code === 'COOLDOWN') startFbCooldown();
    } finally { setFbSending(false); }
  }

  async function handleFbResend() {
    if (fbCooldown > 0 || fbSending) return;
    setFbError(''); setFbSending(true);
    try {
      await apiPost('/api/auth/passwordless/otp/request', { email: fbEmail });
      setFbSent(true);
      startFbCooldown();
    } catch (err) {
      setFbError(otpErrorMessage(err));
      const code = (err as { code?: string })?.code;
      if (code === 'COOLDOWN') startFbCooldown();
    } finally { setFbSending(false); }
  }

  async function handleFbVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setFbError(''); setFbVerifying(true);
    try {
      const res = await apiPost<{ user: User }>('/api/auth/passwordless/otp/verify', { email: fbEmail, code: fbCode });
      setUser(res.user);
      routeAfterAuth(router, res.user);
    } catch (err) {
      setFbError(err instanceof Error ? err.message : 'Invalid code');
    } finally { setFbVerifying(false); }
  }

  if (linkStatus === 'checking') {
    return (
      <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-[var(--sub)]">Signing you in…</p>
      </div>
    );
  }

  if (!showFallback) {
    // Shouldn't normally be reached (checking/error always sets
    // showFallback), but keep a safe default rather than render nothing.
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {fbStage === 'code' ? 'Enter your code' : 'Use a verification code'}
        </h1>
        <p className="text-sm text-[var(--sub)] mt-1">
          {linkStatus === 'error'
            ? `${linkError} — you can request a fresh sign-in code below instead.`
            : fbStage === 'code'
              ? <>We sent a 6-digit code to <strong className="font-semibold text-[var(--text)]">{fbEmail}</strong>.</>
              : 'Enter your email and we\'ll send you a 6-digit code.'}
        </p>
      </div>

      {fbError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{fbError}</div>
      )}
      {fbSent && !fbError && fbStage === 'code' && (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">Email sent — check your inbox.</div>
      )}

      {fbStage === 'email' ? (
        <form onSubmit={handleFbSendCode} className="space-y-4">
          <input
            type="email"
            value={fbEmail}
            onChange={e => setFbEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
          <Button type="submit" loading={fbSending} fullWidth>Send code</Button>
        </form>
      ) : (
        <form onSubmit={handleFbVerifyCode} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={fbCode}
            onChange={e => setFbCode(e.target.value.replace(/\D/g, ''))}
            required
            placeholder="123456"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm text-center tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
          <Button type="submit" loading={fbVerifying} fullWidth>Verify</Button>
          <p className="text-center text-sm text-[var(--sub)]">
            Didn&apos;t get the code?{' '}
            <button
              type="button"
              onClick={handleFbResend}
              disabled={fbSending || fbCooldown > 0}
              className="text-[var(--primary)] font-semibold hover:underline disabled:opacity-40"
            >
              {fbSending ? 'Sending…' : fbCooldown > 0 ? `Resend in ${fbCooldown}s` : 'Resend'}
            </button>
          </p>
        </form>
      )}
    </div>
  );
}

export default function VerifyMagicPage() {
  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Suspense fallback={
          <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 text-center text-sm text-[var(--sub)]">
            Loading…
          </div>
        }>
          <VerifyMagicInner />
        </Suspense>
      </div>
    </div>
  );
}
