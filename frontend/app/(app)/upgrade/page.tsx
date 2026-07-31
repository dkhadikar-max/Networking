'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiGet } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { User } from '@/lib/types';

// Required for the nonce-based CSP in proxy.ts to apply — nonces can only be
// injected during server-side rendering at request time.
export const dynamic = 'force-dynamic';

type PlanKey = 'monthly' | 'quarterly';
type CurrencyKey = 'INR' | 'USD';

type Config = {
  key_id: string;
  enabled: boolean;
  plans: {
    monthly:   { INR: { amount: number; label: string }; USD: { amount: number; label: string } };
    quarterly: { INR: { amount: number; label: string }; USD: { amount: number; label: string } };
  };
};

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const FEATURES = [
  { icon: '⚡', text: '200 connections/day', sub: 'vs 30 on free' },
  { icon: '❤️', text: 'See everyone who liked you', sub: 'full reveal, no blur' },
  { icon: '🎯', text: '20 priority messages/month', sub: 'skip the queue' },
  { icon: '⭐', text: 'Priority badge on your profile', sub: 'stand out in discovery' },
  { icon: '📍', text: 'Exact location radius filter', sub: 'find people under 200 km' },
];

export default function UpgradePage() {
  const router  = useRouter();
  const { user, setUser } = useAuth();
  const toast   = useToast();

  const [config, setConfig]   = useState<Config | null>(null);
  const [plan, setPlan]       = useState<PlanKey>('quarterly');
  const [currency, setCurrency] = useState<CurrencyKey>('INR');
  const [paying, setPaying]   = useState(false);

  const isPremium = !!(user?.premium || user?.is_premium);

  useEffect(() => {
    apiGet<Config>('/api/payments/config').then(setConfig).catch(() => {});
  }, []);

  async function handleUpgrade() {
    if (!config?.enabled) {
      toast('Payments are not available yet — check back soon', 'error');
      return;
    }
    setPaying(true);
    let payment_token = '';
    try {
      // Step 1: get short-lived payment-scoped token
      const session = await apiPost<{ payment_token: string }>('/api/payments/session', {});
      payment_token = session.payment_token;

      // Step 2: create Razorpay order
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${payment_token}` },
        credentials: 'include',
        body: JSON.stringify({ plan, currency }),
      });
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Could not create order');
      }
      const order = await orderRes.json() as { order_id: string; amount: number; currency: string; label: string };

      // Step 3: load Razorpay SDK
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load payment gateway — check your connection');

      // Step 4: open checkout
      const rzp = new window.Razorpay({
        key:         config.key_id,
        amount:      order.amount,
        currency:    order.currency,
        name:        'Build Your Network',
        description: `BYN Premium — ${order.label}`,
        order_id:    order.order_id,
        prefill:     { name: user?.name ?? '', email: (user as User & { email?: string })?.email ?? '' },
        theme:       { color: '#157A6E' },
        handler: async (response: RazorpayResponse) => {
          try {
            const verRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${payment_token}` },
              credentials: 'include',
              body: JSON.stringify({ ...response, plan }),
            });
            const verified = await verRes.json() as { ok?: boolean; error?: string };
            if (verified.ok) {
              if (user) setUser({ ...user, premium: true, is_premium: true });
              toast('Welcome to BYN Premium! 🎉', 'success');
              router.replace('/profile');
            } else {
              toast(verified.error || 'Payment verification failed', 'error');
              setPaying(false);
            }
          } catch {
            toast('Verification failed — contact support@buildyournetwork.online', 'error');
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Payment failed', 'error');
      setPaying(false);
    }
  }

  const selectedPrice = config?.plans[plan][currency];

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 0 12px', borderBottom: '1px solid var(--border)',
          marginBottom: 20, position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--bg)', backdropFilter: 'blur(12px)',
        }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', color: 'var(--text-soft)', fontSize: 22, lineHeight: 1, flexShrink: 0 }}
          >
            ←
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>
            Go Premium
          </h1>
        </div>

        {isPremium ? (
          /* ── Already premium ── */
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>⭐</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.3px' }}>
              You&apos;re Premium
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.6, marginBottom: 28 }}>
              All premium features are active on your account.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {FEATURES.map(f => (
                <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: 'white', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>{f.icon}</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{f.text}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.sub}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 16 }}>✓</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.back()}
              style={{ padding: '13px 32px', borderRadius: 12, background: 'var(--sur2)', border: '1.5px solid var(--border)', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Back to profile
            </button>
          </div>
        ) : (
          /* ── Upgrade flow ── */
          <>
            {/* Hero */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>⭐</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.4px' }}>
                Unlock Premium
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.55 }}>
                Connect more, stand out more, and grow your network faster.
              </p>
            </div>

            {/* Features */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {FEATURES.map(f => (
                <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'white', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{f.text}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Currency toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', background: 'var(--sur2)', borderRadius: 10, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
                {(['INR', 'USD'] as CurrencyKey[]).map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    style={{
                      padding: '7px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      background: currency === c ? 'white' : 'transparent',
                      color: currency === c ? 'var(--text)' : 'var(--muted)',
                      boxShadow: currency === c ? '0 1px 4px rgba(15,23,42,0.10)' : 'none',
                    }}
                  >
                    {c === 'INR' ? '₹ INR' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan cards */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              {(['monthly', 'quarterly'] as PlanKey[]).map(p => {
                const price = config?.plans[p][currency];
                const active = plan === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPlan(p)}
                    style={{
                      flex: 1, padding: '16px 12px', borderRadius: 16, cursor: 'pointer',
                      border: active ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                      background: active ? 'linear-gradient(135deg,rgba(21,122,110,0.07),rgba(29,183,166,0.04))' : 'white',
                      fontFamily: 'inherit', textAlign: 'center', position: 'relative',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p === 'quarterly' && (
                      <div style={{
                        position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                        background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 800,
                        padding: '3px 10px', borderRadius: 99, letterSpacing: '0.3px', whiteSpace: 'nowrap',
                      }}>
                        BEST VALUE
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--primary)' : 'var(--text-soft)', marginBottom: 6, textTransform: 'capitalize' }}>
                      {p}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>
                      {price?.label ?? '—'}
                    </div>
                    {p === 'quarterly' && currency === 'INR' && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>~₹200/mo · save 20%</div>
                    )}
                    {p === 'quarterly' && currency === 'USD' && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>~$13/mo · save 32%</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* CTA */}
            <button
              onClick={handleUpgrade}
              disabled={paying || !config}
              style={{
                width: '100%', padding: '16px', borderRadius: 14,
                background: paying || !config ? 'var(--border)' : 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                color: 'white', border: 'none', fontSize: 16, fontWeight: 800,
                cursor: paying || !config ? 'not-allowed' : 'pointer',
                boxShadow: paying || !config ? 'none' : '0 8px 24px rgba(21,122,110,0.3)',
                fontFamily: 'inherit', transition: 'all 0.15s', letterSpacing: '-0.2px',
              }}
            >
              {paying ? 'Opening payment…' : `Upgrade for ${selectedPrice?.label ?? '…'}`}
            </button>

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
              Secure payment via Razorpay · Cancel anytime · No hidden charges
            </p>
          </>
        )}
      </div>
    </div>
  );
}
