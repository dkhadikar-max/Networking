'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

declare global {
  interface Window {
    __ga_loaded?: boolean;
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const COOKIE_NAME = 'byn_consent';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function getConsent(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)byn_consent=([^;]+)/);
  return match ? match[1] : null;
}

function setConsent(value: 'analytics' | 'none') {
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  if (value === 'analytics') loadGA();
}

function loadGA() {
  if (typeof window === 'undefined' || window.__ga_loaded) return;
  window.__ga_loaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-5NQDBYG4CJ';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) { window.dataLayer.push(args); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-5NQDBYG4CJ');
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (consent === null) {
      setVisible(true); // eslint-disable-line react-hooks/set-state-in-effect
    } else if (consent === 'analytics') {
      loadGA();
    }
  }, []);

  if (!visible) return null;

  function accept() {
    setConsent('analytics');
    setVisible(false);
  }

  function decline() {
    setConsent('none');
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-[150] bg-white border-t border-[var(--border)] shadow-[var(--shadow-xl)]"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-[var(--sub)] flex-1 leading-relaxed">
          We use cookies to improve your experience. Analytics cookies (Google Analytics) are only loaded with your consent.{' '}
          <Link href="/privacy" className="text-[var(--primary)] hover:underline underline-offset-2">Learn more</Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-[var(--border)] text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
