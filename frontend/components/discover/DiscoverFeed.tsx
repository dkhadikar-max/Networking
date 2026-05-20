'use client';

import { useEffect, useState, useCallback } from 'react';
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
    setProfiles(prev => {
      const next = prev.filter(p => getUid(p) !== uid);
      if (next.length <= 3 && !exhausted) load(false);
      return next;
    });
  }

  const current = profiles[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div className="disc-header">
        <span className="disc-logo">BuildYourNetwork</span>
        <button className="filter-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          Filters
        </button>
      </div>

      {/* Card area */}
      <div className="card-stack-area">

        {loading && !current && (
          <div className="disc-empty">
            <div className="spinner" />
          </div>
        )}

        {!loading && !current && (
          <div className="disc-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <h3>You&apos;re all caught up</h3>
            <p>No more profiles to show right now. Check back later or adjust your filters.</p>
            <button className="retry-btn" onClick={() => load(true)}>Refresh</button>
          </div>
        )}

        {current && (
          <SwipeCard
            key={getUid(current)}
            profile={current}
            onConnect={() => handleConnect(current)}
            onSkip={() => handleSkip(current)}
            onSelect={() => openProfile(current, {
              onConnect: () => handleConnect(current),
              onSkip: () => handleSkip(current),
            })}
          />
        )}

      </div>
    </div>
  );
}
