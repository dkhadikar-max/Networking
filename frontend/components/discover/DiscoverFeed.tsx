/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import SwipeCard from './SwipeCard';
import DiscoverFilters, { DEFAULT_FILTERS, activeFilterCount } from './DiscoverFilters';
import type { FilterState } from './DiscoverFilters';
import type { DiscoverProfile } from '@/lib/types';

type ApiResponse = { profiles: DiscoverProfile[] };

function getUid(p: DiscoverProfile): string {
  return (p.user as { id?: string } | undefined)?.id ?? (p as { id?: string }).id ?? '';
}

function buildUrl(filters: FilterState, offset: number, intent?: string): string {
  const p = new URLSearchParams();
  p.set('limit', '10');
  p.set('offset', String(offset));
  if (filters.sort === 'recent') p.set('sort', 'recent');
  if (intent) p.set('intent', intent);
  if (filters.location === 'remote') p.set('remote', 'true');
  if (filters.location === 'worldwide') p.set('worldwide', 'true');
  return `/api/discover?${p}`;
}

// Fetch with multi-intent support: parallel calls per intent, then merge+deduplicate by id
async function fetchProfiles(filters: FilterState, offset: number): Promise<{ profiles: DiscoverProfile[]; exhausted: boolean }> {
  const intents = filters.intents;
  if (intents.length <= 1) {
    const data = await apiGet<ApiResponse>(buildUrl(filters, offset, intents[0]));
    const profiles = data.profiles ?? [];
    return { profiles, exhausted: profiles.length < 10 };
  }
  // 2-3 intents: parallel fetch, merge, deduplicate, re-sort by matchScore
  const results = await Promise.all(intents.map(intent => apiGet<ApiResponse>(buildUrl(filters, offset, intent)).then(d => d.profiles ?? []).catch(() => [])));
  const seen = new Set<string>();
  const merged: DiscoverProfile[] = [];
  for (const batch of results) {
    for (const p of batch) {
      const uid = (p as { id?: string }).id ?? '';
      if (uid && !seen.has(uid)) { seen.add(uid); merged.push(p); }
    }
  }
  merged.sort((a, b) => ((b.matchScore ?? b.match_score ?? 0) - (a.matchScore ?? a.match_score ?? 0)));
  return { profiles: merged.slice(0, 20), exhausted: merged.length < 20 };
}

export default function DiscoverFeed() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const filtersRef = useRef(filters);

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const load = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const offset = reset ? 0 : page * 10;
      const { profiles: incoming, exhausted: done } = await fetchProfiles(filtersRef.current, offset);
      if (done) setExhausted(true);
      setProfiles(prev => reset ? incoming : [...prev, ...incoming]);
      if (!reset) setPage(p => p + 1);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'NO_PHOTO') {
        toast('Add a profile photo to start discovering people', 'error');
      } else if (code === 'TRUST_TOO_LOW') {
        toast('Set your networking goal in your profile to unlock Discovery', 'error');
      } else {
        toast('Failed to load profiles', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [page, toast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load(true); }, []);

  function applyFilters(f: FilterState) {
    filtersRef.current = f;
    setFilters(f);
    setPage(0);
    setExhausted(false);
    setProfiles([]);
    load(true);
  }

  async function handleConnect(profile: DiscoverProfile) {
    const uid = getUid(profile);
    if (!uid) return;
    try {
      await apiPost('/api/connect', { userId: uid });
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
  const filterCount = activeFilterCount(filters);

  return (
    <div className="discover-wrap" style={{ flex: 1, minHeight: 0 }}>

      {/* Left column: header + card stack */}
      <div className="discover-left" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

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
          <button className="filter-btn" onClick={() => setShowFilters(true)}>
            ⚡ Filters&nbsp;
            <span style={{
              background: filterCount > 0 ? 'var(--primary)' : 'var(--border)',
              color: filterCount > 0 ? 'white' : 'var(--text-soft)',
              borderRadius: 8, padding: '1px 6px', fontSize: 11, fontWeight: 700,
            }}>
              {filterCount}
            </span>
          </button>
        </div>

        {/* Filter sheet */}
        <DiscoverFilters
          open={showFilters}
          current={filters}
          onApply={applyFilters}
          onClose={() => setShowFilters(false)}
        />

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
            />
          )}

        </div>
      </div>

    </div>
  );
}
