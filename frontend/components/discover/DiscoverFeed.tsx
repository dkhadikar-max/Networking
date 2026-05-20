'use client';

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useProfileDrawer } from '@/context/ProfileDrawerContext';
import SwipeCard from './SwipeCard';
import type { DiscoverProfile } from '@/lib/types';

type ApiResponse = { profiles: DiscoverProfile[] };

function getUid(p: DiscoverProfile): string {
  return (p.user as { id?: string } | undefined)?.id ?? (p as { id?: string }).id ?? '';
}

export default function DiscoverFeed() {
  const toast = useToast();
  const { openProfile, updateDrawerProfile } = useProfileDrawer();
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  const load = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const offset = reset ? 0 : page * 10;
      const data = await apiGet<ApiResponse>(`/api/discover?sort=relevance&limit=10&offset=${offset}`);
      const incoming = data.profiles ?? [];
      if (incoming.length < 10) setExhausted(true);
      setProfiles(prev => reset ? incoming : [...prev, ...incoming]);
      if (!reset) setPage(p => p + 1);
    } catch {
      toast('Failed to load profiles', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect(profile: DiscoverProfile) {
    const uid = getUid(profile);
    if (!uid) return;
    try {
      await apiPost('/api/connect', { userId: uid });
      const updated = { ...profile, connection: { id: 'pending' } };
      setProfiles(prev => prev.map(p => getUid(p) === uid ? updated : p));
      updateDrawerProfile(updated);
      toast('Connection request sent!', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to connect', 'error');
    }
  }

  function handleSkip(profile: DiscoverProfile) {
    const uid = getUid(profile);
    setProfiles(prev => prev.filter(p => getUid(p) !== uid));
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col">

        {loading && profiles.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && profiles.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                </svg>
              </div>
              <h3 className="font-bold text-[var(--text)] mb-1">You&apos;re all caught up</h3>
              <p className="text-sm text-[var(--sub)]">Check back later for new profiles</p>
            </div>
          </div>
        )}

        {profiles.length > 0 && (
          <div className="max-w-2xl mx-auto w-full">
            <h1 className="text-xl font-bold text-[var(--text)] mb-4">Discover</h1>
            <div className="grid gap-4 sm:grid-cols-2">
              <AnimatePresence>
                {profiles.map(profile => {
                  const uid = getUid(profile);
                  return (
                    <SwipeCard
                      key={uid}
                      profile={profile}
                      onConnect={() => handleConnect(profile)}
                      onSkip={() => handleSkip(profile)}
                      onSelect={() => openProfile(profile, {
                        onConnect: () => handleConnect(profile),
                        onSkip: () => handleSkip(profile),
                      })}
                    />
                  );
                })}
              </AnimatePresence>
            </div>

            {!exhausted && !loading && (
              <button
                onClick={() => load(false)}
                className="mt-6 w-full py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors"
              >
                Load more
              </button>
            )}
            {loading && (
              <div className="flex justify-center mt-6">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
