'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPost } from '@/lib/api';
import NetworkBackground from '@/components/NetworkBackground';
import { safeNext, withNext } from '@/lib/authRedirect';

const MAGIC_LINK_COOLDOWN_S = 60;

function magicLinkErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case 'COOLDOWN':           return 'Please wait before requesting another link';
    case 'TOO_MANY_ATTEMPTS':  return 'Too many attempts';
    case 'IP_BLOCKED':         return err instanceof Error ? err.message : 'Too many attempts';
    case 'EMAIL_SERVICE_DOWN': return 'Email service temporarily unavailable';
    default:                   return err instanceof Error ? err.message : 'Failed to send link';
  }
}

function SignupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  // Referral attribution — /r/:code (server.js) redirects to /app?ref=:code,
  // which next.config.ts's redirects() then forwards on to here as
  // /signup?ref=:code (Next.js passes incoming query values through a
  // redirect automatically — confirmed against the installed version's own
  // docs, not assumed). This is the ONLY entry point a referral link ever
  // uses, so capturing it here at signup-page load is sufficient — nothing
  // downstream needs it to survive further navigation. Server-side
  // (server.js) re-validates and sanitizes this regardless; no need to
  // duplicate that here.
  const refCode = searchParams.get('ref');

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Honeypot — real users never see or fill this (see the off-screen input
  // below); a scripted signup that fills every field blind typically will.
  // Server rejects silently (server.js, /api/auth/magic-link/request) if
  // non-empty.
  const [companyWebsite, setCompanyWebsite] = useState('');

  // Canonical registration flow (locked spec): Basic Details (name + email)
  // -> Magic Link Verification -> Onboarding -> Active. Magic link is the
  // ONLY registration path now — password-based signup (/api/signup) was
  // retired server-side; there is no fallback form on this page anymore.
  const [magicName, setMagicName] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState('');
  const [magicCooldown, setMagicCooldown] = useState(0);
  const magicCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (magicCooldownRef.current) clearInterval(magicCooldownRef.current); }, []);

  function startMagicCooldown() {
    setMagicCooldown(MAGIC_LINK_COOLDOWN_S);
    if (magicCooldownRef.current) clearInterval(magicCooldownRef.current);
    magicCooldownRef.current = setInterval(() => {
      setMagicCooldown(s => {
        if (s <= 1) { if (magicCooldownRef.current) clearInterval(magicCooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function requestMagicLink() {
    if (magicCooldown > 0 || magicSubmitting) return;
    setMagicError(''); setMagicSubmitting(true);
    try {
      await apiPost('/api/auth/magic-link/request', {
        name: magicName, email: magicEmail, age_confirmed: true, company_website: companyWebsite,
        // Embedded in the emailed link itself (server.js validates
        // server-side too — this crosses an email round-trip, so client
        // validation alone isn't enough) so the CTA that brought this
        // visitor to signup survives all the way through.
        next: next ? safeNext(next) : undefined,
        // Referral attribution — see refCode above.
        ref_code: refCode || undefined,
      });
      setMagicSent(true);
      startMagicCooldown();
    } catch (err) {
      setMagicError(magicLinkErrorMessage(err));
      const code = (err as { code?: string })?.code;
      if (code === 'COOLDOWN') startMagicCooldown();
    } finally { setMagicSubmitting(false); }
  }

  function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!magicName.trim()) { setMagicError('Please enter your name.'); return; }
    if (!ageConfirmed) { setMagicError('Please confirm you are 18 or older.'); return; }
    if (!termsAccepted) { setMagicError('Please accept the Terms and Privacy Policy.'); return; }
    requestMagicLink();
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

  const consentCheckboxes = (
    <>
      <label
        htmlFor="signup-age"
        className="cursor-pointer flex items-center gap-3 py-1 select-none"
        style={{ marginBottom: 8 }}
      >
        <input
          type="checkbox"
          id="signup-age"
          checked={ageConfirmed}
          onChange={e => setAgeConfirmed(e.target.checked)}
          style={{ accentColor: '#157A6E', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          I confirm I am at least 18 years old
        </span>
      </label>

      <label
        htmlFor="signup-terms"
        className="cursor-pointer flex items-center gap-3 py-1 select-none"
        style={{ marginBottom: 20 }}
      >
        <input
          type="checkbox"
          id="signup-terms"
          checked={termsAccepted}
          onChange={e => setTermsAccepted(e.target.checked)}
          style={{ accentColor: '#157A6E', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          I agree to the{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#157A6E', fontWeight: 600 }}
          >
            Terms of Service
          </a>
          {' '}and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#157A6E', fontWeight: 600 }}
          >
            Privacy Policy
          </a>
        </span>
      </label>
    </>
  );

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
          Create account
        </h1>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 22 }}>Join thousands of builders</p>

        {magicSent ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{
              background: 'rgba(21,122,110,.08)', border: '1.5px solid rgba(21,122,110,.2)',
              borderRadius: 14, padding: '18px 16px', marginBottom: 16,
            }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Check your email</p>
              <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                We sent a sign-in link to <strong>{magicEmail}</strong>. It expires in 15 minutes and works once.
              </p>
            </div>
            <button
              type="button"
              onClick={requestMagicLink}
              disabled={magicCooldown > 0 || magicSubmitting}
              style={{ background: 'none', border: 'none', color: '#157A6E', fontWeight: 600, fontSize: 13, cursor: magicCooldown > 0 ? 'not-allowed' : 'pointer', opacity: magicCooldown > 0 ? 0.4 : 1 }}
            >
              {magicSubmitting ? 'Sending…' : magicCooldown > 0 ? `Resend in ${magicCooldown}s` : 'Resend link'}
            </button>
            <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 14 }}>
              Didn&apos;t get the email?{' '}
              <Link href={withNext(`/verify-magic?fallback=1&email=${encodeURIComponent(magicEmail)}`, next)} style={{ color: '#157A6E', fontWeight: 600 }}>
                Use verification code instead
              </Link>
            </p>
          </div>
        ) : (
          <>
            {magicError && (
              <div style={{
                background: 'rgba(239,68,68,.07)', border: '1.5px solid rgba(239,68,68,.2)',
                borderRadius: 12, padding: '12px 14px', marginBottom: 14,
                fontSize: 13, color: '#EF4444', lineHeight: 1.5,
              }}>
                {magicError}
              </div>
            )}
            <form onSubmit={handleMagicLinkSubmit} noValidate>
              {/* Honeypot — positioned off-screen rather than display:none (some
                  scrapers skip display:none fields), not tab-reachable, no label
                  a screen reader would announce as a real field.
                  `name` is deliberately NOT "company_website" (or "company",
                  "organization", "website", "url", etc.) — that was the actual
                  bug: Chrome/password-manager autofill matches an input's `name`
                  (and autocomplete token) against known field categories
                  regardless of CSS visibility, so a real user with a saved
                  "Company"/organization profile got this hidden field silently
                  filled in and their genuine signup rejected as "Invalid signup
                  request". The value posted to the API is still keyed
                  `company_website` (see requestMagicLink above) — only the DOM
                  attribute autofill actually reads has changed. */}
              <input
                type="text"
                name="bx_hp_9f2"
                value={companyWebsite}
                onChange={e => setCompanyWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />

              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 7, letterSpacing: '0.7px', fontWeight: 600, textTransform: 'uppercase' }}>
                Full name
              </div>
              <input
                type="text"
                id="signup-name"
                value={magicName}
                onChange={e => setMagicName(e.target.value)}
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
                value={magicEmail}
                onChange={e => setMagicEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                onFocus={focusInput}
                onBlur={blurInput}
                style={{ ...inputStyle, marginBottom: 14 }}
              />
              {consentCheckboxes}
              <button
                type="submit"
                disabled={magicSubmitting || magicCooldown > 0}
                style={{
                  width: '100%', background: '#F4A259', color: '#fff',
                  borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 700,
                  minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: magicSubmitting ? 'none' : '0 8px 20px rgba(244,162,89,.3)',
                  border: 'none', cursor: magicSubmitting ? 'not-allowed' : 'pointer',
                  opacity: magicSubmitting || magicCooldown > 0 ? 0.5 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {magicSubmitting ? 'Sending…' : 'Continue with email'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Switch row */}
      <div style={{ textAlign: 'center', fontSize: 14 }}>
        <span style={{ color: '#64748B' }}>Already have an account? </span>
        <Link href={withNext('/login', next)} style={{ color: '#157A6E', fontWeight: 600 }}>Sign in →</Link>
      </div>

      </div>{/* /zIndex wrapper */}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    }>
      <SignupInner />
    </Suspense>
  );
}
