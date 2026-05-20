'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Button from '@/components/ui/Button';

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

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-md)] p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Join Build Your Network</h1>
        <p className="text-sm text-[var(--sub)] mt-1">Your next opportunity is one relationship away</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Full name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Alex Johnson"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--sur2)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          />
        </div>
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={e => setAgeConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-sm text-[var(--sub)]">I confirm I am 16 years of age or older</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-sm text-[var(--sub)]">
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline underline-offset-2">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline underline-offset-2">Privacy Policy</a>
            </span>
          </label>
        </div>
        <Button type="submit" loading={loading} fullWidth>Create account</Button>
      </form>

      <p className="text-center text-sm text-[var(--sub)]">
        Already have an account?{' '}
        <Link href="/login" className="text-[var(--primary)] font-semibold hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
