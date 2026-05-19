'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiGet, apiPost, getToken } from '@/lib/api';
import IntentSelector from '@/components/onboarding/IntentSelector';
import ProfileCompletion from '@/components/onboarding/ProfileCompletion';
import SuggestedConnections from '@/components/onboarding/SuggestedConnections';
import clsx from 'clsx';

const SOURCES = [
  { label: 'LinkedIn',        icon: '💼' },
  { label: 'Instagram',       icon: '📸' },
  { label: 'Twitter/X',       icon: '🐦' },
  { label: 'WhatsApp',        icon: '💬' },
  { label: 'Friend/Referral', icon: '👋' },
  { label: 'Google Search',   icon: '🔍' },
  { label: 'Community/Event', icon: '🎪' },
  { label: 'YouTube',         icon: '▶️' },
  { label: 'Other',           icon: '✨' },
];

const STAGE_ORDER = ['acquisition', 'intent', 'profile', 'complete'] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STEP_LABELS = ['Discover', 'Intent', 'Profile', "You're in"];

type DiscoverProfile = {
  id: string;
  name: string;
  headline: string | null;
  profession: string | null;
  location: string | null;
  photos: string[];
  interests: string[];
  intent: string | null;
};

export default function OnboardingPage() {
  const [stage, setStage]       = useState<Stage | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [source, setSource]     = useState<string | null>(null);
  const [referral, setReferral] = useState('');
  const [suggestions, setSuggestions]     = useState<DiscoverProfile[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!getToken()) { window.location.href = '/'; return; }
    apiGet<{ stage: Stage }>('/api/onboarding/stage')
      .then(r => setStage(r.stage))
      .catch(() => setStage('acquisition'));
  }, []);

  const stepIndex = stage ? STAGE_ORDER.indexOf(stage) : 0;

  async function submitAcquisition() {
    if (!source) return;
    setLoading(true); setError(null);
    try {
      await apiPost('/api/onboarding/acquisition', { source, referral: referral || undefined });
      setStage('intent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function submitIntent(intents: string[]) {
    setLoading(true); setError(null);
    try {
      await apiPost('/api/onboarding/intent', { intents });
      setStage('profile');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  async function submitProfile(data: Record<string, unknown>) {
    setLoading(true); setError(null);
    const { interests, ...rest } = data;
    setUserInterests((interests as string[]) ?? []);
    try {
      await apiPost('/api/onboarding/profile', { ...rest, interests });
      const res = await apiGet<{ profiles: DiscoverProfile[] }>('/api/discover?sort=relevance')
        .catch(() => ({ profiles: [] }));
      setSuggestions(res.profiles ?? []);
      setStage('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  if (!stage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      <header className="sticky top-0 z-10 bg-[var(--bg)] border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <span className="font-bold text-[var(--primary)] text-lg">BYN</span>
          {stage !== 'complete' && (
            <div className="flex items-center gap-2">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    i < stepIndex
                      ? 'bg-[var(--primary)] text-white'
                      : i === stepIndex
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--border)] text-[var(--text-muted)]'
                  )}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={clsx('h-0.5 w-8', i < stepIndex ? 'bg-[var(--primary)]' : 'bg-[var(--border)]')} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2 }}
            >
              {stage === 'acquisition' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--text)]">How did you hear about us?</h2>
                    <p className="text-[var(--text-secondary)] mt-1">Helps us understand where to grow next.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {SOURCES.map(s => (
                      <button
                        key={s.label}
                        onClick={() => setSource(s.label)}
                        className={clsx(
                          'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                          source === s.label
                            ? 'border-[var(--primary)] bg-[var(--highlight)]'
                            : 'border-[var(--border)] bg-white hover:border-[var(--teal)]'
                        )}
                      >
                        <span className="text-2xl">{s.icon}</span>
                        <span className={clsx(
                          'text-xs font-medium text-center leading-tight',
                          source === s.label ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'
                        )}>
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {source === 'Friend/Referral' && (
                    <input
                      value={referral}
                      onChange={e => setReferral(e.target.value)}
                      placeholder="Referrer's name (optional)"
                      className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  )}
                  <button
                    onClick={submitAcquisition}
                    disabled={!source || loading}
                    className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold disabled:opacity-40 hover:bg-[var(--primary-dark)] transition-colors"
                  >
                    {loading ? 'Saving…' : 'Continue →'}
                  </button>
                </div>
              )}

              {stage === 'intent' && (
                <IntentSelector onNext={submitIntent} loading={loading} />
              )}

              {stage === 'profile' && (
                <ProfileCompletion onNext={submitProfile} loading={loading} />
              )}

              {stage === 'complete' && (
                <SuggestedConnections
                  profiles={suggestions}
                  userInterests={userInterests}
                  onDone={() => { window.location.href = 'https://buildyournetwork.online/webapp.html'; }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
