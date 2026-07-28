'use client';

import { useEffect } from 'react';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app error boundary]', error);
  }, [error]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: 'var(--sub)', maxWidth: 320, lineHeight: 1.5 }}>
        This screen hit an unexpected error. You can try again, or head back to Discover.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          onClick={reset}
          style={{ padding: '10px 20px', borderRadius: 'var(--r-md)', background: 'var(--primary)', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Try again
        </button>
        <a
          href="/discover"
          style={{ padding: '10px 20px', borderRadius: 'var(--r-md)', background: 'var(--sur2)', color: 'var(--text-soft)', border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' }}
        >
          Go to Discover
        </a>
      </div>
    </div>
  );
}
