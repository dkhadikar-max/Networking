'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/api';
import NetworkBackground from '@/components/NetworkBackground';
import AuthCard from '@/components/AuthCard';
import CookieBanner from '@/components/ui/CookieBanner';
import Vignette from '@/components/Vignette';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  // ── Production state (unchanged) ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Production submit handler (unchanged) ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { user } = await login(email, password);
      if (!user.email_verified) {
        apiPost('/api/auth/send-otp', {}).catch(() => {});
        router.replace('/verify');
        return;
      }
      if (user.onboarding_stage !== 'complete') { router.replace('/onboarding'); return; }
      router.replace('/discover');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <NetworkBackground />
      <Vignette />

      <AuthCard
        title="Welcome back"
        subtitle="Sign in to your BYN account"
        footer={
          <>
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="text-[#0D7377] font-semibold hover:text-[#14B8A6] relative after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-0.5 after:bg-[#14B8A6] hover:after:w-full after:transition-all"
            >
              Sign up
            </Link>
          </>
        }
      >
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="mb-5">
            <label htmlFor="email" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full px-4 py-3.5 text-[15px] text-gray-800 bg-white border-2 border-gray-200 rounded-xl outline-none transition-all duration-300 hover:border-gray-300 focus:border-[#14B8A6] focus:shadow-[0_0_0_4px_rgba(20,184,166,0.1),0_1px_3px_rgba(0,0,0,0.05)] focus:-translate-y-0.5 placeholder:text-gray-400"
            />
          </div>

          {/* Password */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="login-password" className="text-[13px] font-semibold text-gray-700 tracking-wide">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#0D7377] font-semibold hover:text-[#14B8A6] relative after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-0.5 after:bg-[#14B8A6] hover:after:w-full after:transition-all"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              id="login-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full px-4 py-3.5 text-[15px] text-gray-800 bg-white border-2 border-gray-200 rounded-xl outline-none transition-all duration-300 hover:border-gray-300 focus:border-[#14B8A6] focus:shadow-[0_0_0_4px_rgba(20,184,166,0.1),0_1px_3px_rgba(0,0,0,0.05)] focus:-translate-y-0.5 placeholder:text-gray-400"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 text-base font-semibold text-white bg-gradient-to-br from-[#0D7377] to-[#14B8A6] rounded-xl cursor-pointer relative overflow-hidden transition-all duration-300 shadow-[0_4px_14px_rgba(13,115,119,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(13,115,119,0.4)] active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none group"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-[600ms] group-hover:translate-x-full" />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </AuthCard>
      <CookieBanner />
    </main>
  );
}
