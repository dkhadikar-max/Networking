'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import NetworkBackground from '@/components/NetworkBackground';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { user } = await login(email, password);
      if (!user.email_verified) {
        apiPost('/api/auth/send-otp', {}).catch(() => {});
        router.replace('/verify?email=' + encodeURIComponent(email));
        return;
      }
      if (user.onboarding_stage !== 'complete') { router.replace('/onboarding'); return; }
      router.replace('/discover');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#157A6E';
    e.target.style.boxShadow = '0 0 0 3px rgba(21,122,110,.1)';
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#E2E8F0';
    e.target.style.boxShadow = 'none';
  }

  return (
    <div style={{
      fontFamily: 'var(--font-sans)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px 20px',
      overflowY: 'auto',
      position: 'relative',
    }}>
      <NetworkBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <span style={{ display: 'block', marginBottom: 14 }}>
          {/* Real BYN logo asset — this used to be a hand-drawn SVG approximation
              (different node layout, different colors) that didn't match the
              actual mark used everywhere else in the product. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo.png"
            alt="Build Your Network"
            width={60}
            height={60}
            style={{
              width: 60, height: 60, borderRadius: 18,
              boxShadow: '0 18px 36px rgba(21,122,110,.32)',
              margin: '0 auto 2px', display: 'block',
            }}
          />
        </span>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', marginTop: 4 }}>
          Build Your Network
        </div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 5, letterSpacing: '0.1px' }}>
          Professional networking — by intent
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#FFFFFF', borderRadius: 34, padding: '28px 24px',
        border: '1px solid rgba(226,232,240,.8)',
        boxShadow: '0 12px 36px rgba(15,23,42,.09)',
        marginBottom: 20,
      }}>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.3px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 22 }}>Sign in to continue</p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,.07)', border: '1.5px solid rgba(239,68,68,.2)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 14,
            fontSize: 13, color: '#EF4444', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 7, letterSpacing: '0.7px', fontWeight: 600, textTransform: 'uppercase' }}>
            Email
          </div>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            onFocus={focusInput}
            onBlur={blurInput}
            style={{
              width: '100%', background: '#F8FAFC',
              border: '1.5px solid #E2E8F0', borderRadius: 12,
              padding: '14px 16px', color: '#0F172A', fontSize: 15,
              marginBottom: 14, outline: 'none',
              fontFamily: 'inherit', transition: 'border-color .18s,box-shadow .18s',
            }}
          />

          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 7, letterSpacing: '0.7px', fontWeight: 600, textTransform: 'uppercase' }}>
            Password
          </div>
          <input
            type="password"
            id="login-pw"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
            onFocus={focusInput}
            onBlur={blurInput}
            style={{
              width: '100%', background: '#F8FAFC',
              border: '1.5px solid #E2E8F0', borderRadius: 12,
              padding: '14px 16px', color: '#0F172A', fontSize: 15,
              marginBottom: 8, outline: 'none',
              fontFamily: 'inherit', transition: 'border-color .18s,box-shadow .18s',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Link
              href="/forgot-password"
              style={{ fontSize: 12.5, color: '#157A6E', fontWeight: 600, textDecoration: 'none' }}
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: '#F4A259', color: '#fff',
              borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 700,
              minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: loading ? 'none' : '0 8px 20px rgba(244,162,89,.3)',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              fontFamily: 'inherit',
              transition: 'opacity .15s,transform .15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Switch row */}
      <div style={{ textAlign: 'center', fontSize: 14 }}>
        <span style={{ color: '#64748B' }}>Don&apos;t have an account? </span>
        <Link href="/signup" style={{ color: '#157A6E', fontWeight: 600 }}>Create one →</Link>
      </div>

      </div>{/* /zIndex wrapper */}
    </div>
  );
}
