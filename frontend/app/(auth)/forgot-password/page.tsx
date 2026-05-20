'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';

type Step = 'request' | 'sent';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiPost('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      setStep('sent');
    } catch {
      // Never reveal whether email exists — show generic message on unexpected failure
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'sent') {
    return (
      <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6 text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            <path d="M16 19h6M19 16v6"/>
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Check your email</h1>
          <p className="text-sm text-[var(--sub)] mt-2 leading-relaxed">
            If <span className="font-medium text-[var(--text)]">{email}</span> is registered, you&apos;ll receive a 6-digit reset code shortly. It expires in 15 minutes.
          </p>
        </div>
        <Link
          href={`/reset-password?email=${encodeURIComponent(email)}`}
          className="block w-full py-3 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold text-center hover:bg-[var(--primary-dark)] transition-colors"
        >
          Enter reset code
        </Link>
        <p className="text-xs text-[var(--muted)]">
          Didn&apos;t receive it? Check spam or{' '}
          <button onClick={() => setStep('request')} className="text-[var(--primary)] font-semibold hover:underline">
            try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Forgot password?</h1>
        <p className="text-sm text-[var(--sub)] mt-1">Enter your email and we&apos;ll send you a reset code.</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <form onSubmit={handleRequest} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Email address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>
        <Button type="submit" loading={loading} fullWidth>Send reset code</Button>
      </form>

      <p className="text-center text-sm text-[var(--sub)]">
        <Link href="/login" className="text-[var(--primary)] font-semibold hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
