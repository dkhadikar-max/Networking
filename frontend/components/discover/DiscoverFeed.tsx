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

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/set-state-in-effect,react-hooks/exhaustive-deps

  async function handleConnect(profile: DiscoverProfile) {
    const uid = getUid(profile);
    if (!uid) return;
    try {
      await apiPost('/api/connect', { userId: uid });
      updateDrawerProfile({ ...profile, connection: { id: 'pending' } });
      toast('Connection request sent!', 'success');
      handleSkip(profile);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to connect', 'error');
    }
  }

  function handleSkip(profile: DiscoverProfile) {
    const uid = getUid(profile);
    let remaining = 0;
    setProfiles(prev => {
      const next = prev.filter(p => getUid(p) !== uid);
      remaining = next.length;
      return next;
    });
    if (remaining <= 3 && !exhausted && !loading) load(false);
  }

  const current = profiles[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div className="disc-header">
        <div className="disc-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="byn-logo-box-sm">
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
              <circle cx="25" cy="25" r="10" fill="#1DB7A6"/>
              <circle cx="75" cy="50" r="16" fill="#1DB7A6"/>
              <circle cx="25" cy="75" r="10" fill="#F4A259"/>
              <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            </svg>
          </div>
          <span>Build Your Network</span>
        </div>
        <button className="filter-btn">
          ⚡ Filters&nbsp;<span style={{ background: 'var(--border)', color: 'var(--text-soft)', borderRadius: 8, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>0</span>
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
