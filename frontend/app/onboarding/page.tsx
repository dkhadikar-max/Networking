'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import IntentSelector from '@/components/onboarding/IntentSelector';
import ProfileCompletion from '@/components/onboarding/ProfileCompletion';
import SuggestedConnections from '@/components/onboarding/SuggestedConnections';
import NetworkBackground from '@/components/NetworkBackground';
import { IconLinkedIn, IconInstagram, IconX, IconWhatsApp, IconWave, IconSearch, IconCalendarUsers, IconPlay, IconSparkle } from '@/components/onboarding/icons';

const SOURCES = [
  { label: 'LinkedIn',        icon: <IconLinkedIn /> },
  { label: 'Instagram',       icon: <IconInstagram /> },
  { label: 'Twitter/X',       icon: <IconX /> },
  { label: 'WhatsApp',        icon: <IconWhatsApp /> },
  { label: 'Friend/Referral', icon: <IconWave /> },
  { label: 'Google Search',   icon: <IconSearch /> },
  { label: 'Community/Event', icon: <IconCalendarUsers /> },
  { label: 'YouTube',         icon: <IconPlay /> },
  { label: 'Other',           icon: <IconSparkle /> },
];

const STAGE_ORDER = ['acquisition', 'intent', 'profile', 'complete'] as const;
type Stage = (typeof STAGE_ORDER)[number];

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
  const router = useRouter();
  const { user, setUser, refreshUser } = useAuth();
  const [stage, setStage]       = useState<Stage | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [source, setSource]     = useState<string | null>(null);
  const [referral, setReferral] = useState('');
  const [suggestions, setSuggestions]     = useState<DiscoverProfile[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);

  useEffect(() => {
    apiGet<{ stage: Stage }>('/api/onboarding/stage')
      .then(r => setStage(r.stage))
      .catch((e: unknown) => {
        const status = (e as { status?: number })?.status;
        if (status === 401 || status === 403) {
          window.location.href = '/login';
        } else {
          setStage('acquisition');
        }
      });
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
      // Refresh full user so AuthContext has the saved bio/interests/scores, not stale onboarding data
      await refreshUser();
      const res = await apiGet<{ profiles: DiscoverProfile[] }>('/api/discover?limit=3')
        .catch(() => ({ profiles: [] }));
      setSuggestions((res.profiles ?? []).slice(0, 3));
      setStage('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }

  if (!stage) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #157A6E', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FFFFFF', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <NetworkBackground />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>

        {/* Header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(226,232,240,0.7)',
          padding: '13px 24px',
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                background: 'linear-gradient(145deg,#157A6E,#0E5E55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(21,122,110,0.28)',
                flexShrink: 0,
              }}>
                <svg width="17" height="17" viewBox="0 0 100 100" fill="none">
                  <circle cx="25" cy="25" r="10" fill="#1DB7A6"/>
                  <circle cx="75" cy="50" r="16" fill="#1DB7A6"/>
                  <circle cx="25" cy="75" r="10" fill="#F4A259"/>
                  <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round"/>
                  <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round"/>
                  <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round"/>
                </svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.3px' }}>Build Your Network</span>
            </div>

            {stage !== 'complete' && (
              <div style={{ display: 'flex', gap: 5 }}>
                {(['acquisition', 'intent', 'profile'] as const).map((s, i) => (
                  <div key={s} style={{
                    width: 36, height: 3, borderRadius: 2,
                    background: i < stepIndex ? '#157A6E' : i === stepIndex ? '#F4A259' : '#E2E8F0',
                    transition: 'background 0.3s ease',
                  }} />
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px 52px' }}>
          <div style={{ width: '100%', maxWidth: 460 }}>

            {error && (
              <div style={{
                marginBottom: 16, padding: '12px 14px', borderRadius: 12,
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#EF4444', fontSize: 13, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <div style={{
              background: '#FFFFFF',
              borderRadius: 28,
              border: '1px solid rgba(226,232,240,0.8)',
              boxShadow: '0 12px 40px rgba(15,23,42,0.09), 0 2px 8px rgba(15,23,42,0.04)',
              padding: '28px 24px',
            }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.18 }}
                >
                  {stage === 'acquisition' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <div>
                        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px', marginBottom: 5 }}>
                          How did you hear about us?
                        </h2>
                        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                          Helps us understand where to grow next.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                        {SOURCES.map(s => (
                          <button
                            key={s.label}
                            onClick={() => setSource(s.label)}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                              padding: '14px 8px', borderRadius: 14, cursor: 'pointer',
                              border: source === s.label ? '2px solid #157A6E' : '1.5px solid #E2E8F0',
                              background: source === s.label ? 'rgba(21,122,110,0.07)' : '#F8FAFC',
                              transition: 'all 0.15s ease',
                              fontFamily: 'inherit',
                            }}
                          >
                            <span style={{ display: 'flex', color: source === s.label ? '#157A6E' : '#94A3B8' }}>{s.icon}</span>
                            <span style={{
                              fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
                              color: source === s.label ? '#157A6E' : '#64748B',
                            }}>
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
                          style={{
                            width: '100%', padding: '13px 14px', borderRadius: 12,
                            border: '1.5px solid #E2E8F0', background: '#F8FAFC',
                            fontSize: 14, color: '#0F172A', outline: 'none',
                            fontFamily: 'inherit',
                          }}
                        />
                      )}

                      <button
                        onClick={submitAcquisition}
                        disabled={!source || loading}
                        style={{
                          width: '100%', padding: '15px 16px', borderRadius: 12,
                          background: '#F4A259', color: '#fff', border: 'none',
                          fontSize: 15, fontWeight: 700, cursor: !source || loading ? 'not-allowed' : 'pointer',
                          opacity: !source || loading ? 0.45 : 1,
                          boxShadow: !source || loading ? 'none' : '0 8px 20px rgba(244,162,89,0.3)',
                          fontFamily: 'inherit', transition: 'opacity 0.15s',
                        }}
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
                      onDone={() => { router.push('/discover'); }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
