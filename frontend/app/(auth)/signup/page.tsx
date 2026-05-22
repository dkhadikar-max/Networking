'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NetworkBackground from '@/components/NetworkBackground';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showStrength, setShowStrength] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ageConfirmed) { setError('Please confirm you are 16 or older.'); return; }
    if (!termsAccepted) { setError('Please accept the Terms and Privacy Policy.'); return; }
    setError(''); setLoading(true);
    try {
      await signup(name, email, password, { age_confirmed: true });
      router.replace('/verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally { setLoading(false); }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPassword(val);
    if (val.length > 0) {
      setShowStrength(true);
      let strength = 0;
      if (val.length >= 8) strength += 25;
      if (val.length >= 12) strength += 25;
      if (/[A-Z]/.test(val)) strength += 25;
      if (/[0-9!@#$%^&*]/.test(val)) strength += 25;
      setPasswordStrength(strength);
    } else {
      setShowStrength(false);
      setPasswordStrength(0);
    }
  }

  function getStrengthColor() {
    if (passwordStrength <= 25) return '#EF4444';
    if (passwordStrength <= 50) return '#F59E0B';
    if (passwordStrength <= 75) return '#22C55E';
    return '#157A6E';
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#157A6E';
    e.target.style.boxShadow = '0 0 0 3px rgba(21,122,110,.1)';
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#E2E8F0';
    e.target.style.boxShadow = 'none';
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#F8FAFC',
    border: '1.5px solid #E2E8F0', borderRadius: 12,
    padding: '14px 16px', color: '#0F172A', fontSize: 15,
    marginBottom: 14, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color .18s,box-shadow .18s',
  };

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
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: 'linear-gradient(145deg,#157A6E,#0E5E55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14),0 18px 36px rgba(21,122,110,.32)',
            margin: '0 auto 2px',
          }}>
            <svg width="34" height="34" viewBox="0 0 100 100" fill="none">
              <circle cx="25" cy="25" r="10" fill="#1DB7A6"/>
              <circle cx="75" cy="50" r="16" fill="#1DB7A6"/>
              <circle cx="25" cy="75" r="10" fill="#F4A259"/>
              <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            </svg>
          </div>
        </span>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', marginTop: 4 }}>
          Build Your Network
        </div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 5, letterSpacing: '0.1px' }}>
          Your next opportunity is one relationship away
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
        <h2 style={{ fontSize: 21, fontWeight: 800, color: '#0F172A', marginBottom: 4, letterSpacing: '-0.3px' }}>
          Create account
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 22 }}>Join thousands of builders</p>

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
            Full name
          </div>
          <input
            type="text"
            id="signup-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Alex Johnson"
            autoComplete="name"
            required
            onFocus={focusInput}
            onBlur={blurInput}
            style={inputStyle}
          />

          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 7, letterSpacing: '0.7px', fontWeight: 600, textTransform: 'uppercase' }}>
            Email
          </div>
          <input
            type="email"
            id="signup-email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            onFocus={focusInput}
            onBlur={blurInput}
            style={inputStyle}
          />

          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 7, letterSpacing: '0.7px', fontWeight: 600, textTransform: 'uppercase' }}>
            Password
          </div>
          <input
            type="password"
            id="signup-password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
            onFocus={focusInput}
            onBlur={blurInput}
            style={{ ...inputStyle, marginBottom: showStrength ? 6 : 14 }}
          />
          {showStrength && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${passwordStrength}%`,
                  background: getStrengthColor(), borderRadius: 2,
                  transition: 'width .3s,background .3s',
                }} />
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="signup-age"
              checked={ageConfirmed}
              onChange={e => setAgeConfirmed(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#157A6E', width: 16, height: 16, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
              I confirm I am 16 years of age or older
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
            <input
              type="checkbox"
              id="signup-terms"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#157A6E', width: 16, height: 16, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#157A6E', fontWeight: 600 }}>
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#157A6E', fontWeight: 600 }}>
                Privacy Policy
              </a>
            </span>
          </label>

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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>

      {/* Switch row */}
      <div style={{ textAlign: 'center', fontSize: 14 }}>
        <span style={{ color: '#64748B' }}>Already have an account? </span>
        <Link href="/login" style={{ color: '#157A6E', fontWeight: 600 }}>Sign in →</Link>
      </div>

      </div>{/* /zIndex wrapper */}
    </div>
  );
}
