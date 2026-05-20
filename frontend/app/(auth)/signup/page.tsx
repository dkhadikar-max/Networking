'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NetworkBackground from '@/components/NetworkBackground';
import AuthCard from '@/components/AuthCard';
import Vignette from '@/components/Vignette';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();

  // ── Production state (unchanged) ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── UI-only state (new visual feature) ──
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [showStrength, setShowStrength] = useState(false);

  // ── Production submit handler (unchanged) ──
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

  // ── UI-only password strength handler ──
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
    if (passwordStrength <= 25) return 'bg-red-500';
    if (passwordStrength <= 50) return 'bg-amber-500';
    if (passwordStrength <= 75) return 'bg-emerald-500';
    return 'bg-[#14B8A6]';
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <NetworkBackground />
      <Vignette />

      <AuthCard
        title="Join Build Your Network"
        subtitle="Your next opportunity is one relationship away"
        footer={
          <>
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-[#0D7377] font-semibold hover:text-[#14B8A6] relative after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-0.5 after:bg-[#14B8A6] hover:after:w-full after:transition-all"
            >
              Sign in
            </Link>
          </>
        }
      >
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div className="mb-5">
            <label htmlFor="signup-name" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              Full name
            </label>
            <input
              type="text"
              id="signup-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Alex Johnson"
              autoComplete="name"
              required
              className="w-full px-4 py-3.5 text-[15px] text-gray-800 bg-white border-2 border-gray-200 rounded-xl outline-none transition-all duration-300 hover:border-gray-300 focus:border-[#14B8A6] focus:shadow-[0_0_0_4px_rgba(20,184,166,0.1),0_1px_3px_rgba(0,0,0,0.05)] focus:-translate-y-0.5 placeholder:text-gray-400"
            />
          </div>

          {/* Email */}
          <div className="mb-5">
            <label htmlFor="signup-email" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              Email
            </label>
            <input
              type="email"
              id="signup-email"
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
            <label htmlFor="signup-password" className="block text-[13px] font-semibold text-gray-700 mb-2 tracking-wide">
              Password
            </label>
            <input
              type="password"
              id="signup-password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full px-4 py-3.5 text-[15px] text-gray-800 bg-white border-2 border-gray-200 rounded-xl outline-none transition-all duration-300 hover:border-gray-300 focus:border-[#14B8A6] focus:shadow-[0_0_0_4px_rgba(20,184,166,0.1),0_1px_3px_rgba(0,0,0,0.05)] focus:-translate-y-0.5 placeholder:text-gray-400"
            />
            <div className={`mt-2 h-1 bg-gray-200 rounded-sm overflow-hidden transition-all ${showStrength ? 'opacity-100' : 'opacity-0'}`}>
              <div
                className={`h-full rounded-sm transition-all duration-300 ${getStrengthColor()}`}
                style={{ width: `${passwordStrength}%` }}
              />
            </div>
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              At least 8 characters
            </div>
          </div>

          {/* Age Confirmation */}
          <div className="flex items-start gap-3 mb-4">
            <div className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                id="signup-age"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                className="peer absolute opacity-0 w-0 h-0"
              />
              <label
                htmlFor="signup-age"
                className="w-5 h-5 border-2 border-gray-300 rounded-md flex items-center justify-center cursor-pointer transition-all duration-200 bg-white hover:border-[#14B8A6] peer-checked:bg-[#0D7377] peer-checked:border-[#0D7377]"
              >
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className="w-3 h-3 transition-opacity duration-200"
                  style={{ opacity: ageConfirmed ? 1 : 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </label>
            </div>
            <label htmlFor="signup-age" className="text-[13px] text-gray-600 leading-relaxed cursor-pointer select-none">
              I confirm I am 16 years of age or older
            </label>
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3 mb-5">
            <div className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                id="signup-terms"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="peer absolute opacity-0 w-0 h-0"
              />
              <label
                htmlFor="signup-terms"
                className="w-5 h-5 border-2 border-gray-300 rounded-md flex items-center justify-center cursor-pointer transition-all duration-200 bg-white hover:border-[#14B8A6] peer-checked:bg-[#0D7377] peer-checked:border-[#0D7377]"
              >
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className="w-3 h-3 transition-opacity duration-200"
                  style={{ opacity: termsAccepted ? 1 : 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </label>
            </div>
            <label htmlFor="signup-terms" className="text-[13px] text-gray-600 leading-relaxed cursor-pointer select-none">
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#0D7377] font-semibold hover:underline">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#0D7377] font-semibold hover:underline">
                Privacy Policy
              </a>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 text-base font-semibold text-white bg-gradient-to-br from-[#0D7377] to-[#14B8A6] rounded-xl cursor-pointer relative overflow-hidden transition-all duration-300 shadow-[0_4px_14px_rgba(13,115,119,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(13,115,119,0.4)] active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none group"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-[600ms] group-hover:translate-x-full" />
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </AuthCard>
    </main>
  );
}
