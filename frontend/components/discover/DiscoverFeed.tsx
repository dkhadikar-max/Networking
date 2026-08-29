/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import SwipeCard from './SwipeCard';
import SwipeCardSkeleton from './SwipeCardSkeleton';
import ContextPanel from './ContextPanel';
import ProfileInspectOverlay from './ProfileInspectOverlay';
import MatchModal from './MatchModal';
import DiscoverFilters, { DEFAULT_FILTERS, activeFilterCount } from './DiscoverFilters';
import type { FilterState } from './DiscoverFilters';
import type { DiscoverProfile } from '@/lib/types';
import { SAMPLE_DISCOVER_PROFILE } from '@/components/landing/samples';

type ApiResponse = { profiles: DiscoverProfile[] };
type MatchInfo = { connectionId: string | null; theirPhoto?: string | null; theirName: string };

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
      const uid = getUid(p);
      if (uid && !seen.has(uid)) { seen.add(uid); merged.push(p); }
    }
  }
  merged.sort((a, b) => ((b.matchScore ?? b.match_score ?? 0) - (a.matchScore ?? a.match_score ?? 0)));
  return { profiles: merged.slice(0, 20), exhausted: merged.length < 20 };
}

type DailySignal = { count: number; city: string };

export default function DiscoverFeed() {
  const toast = useToast();
  const { user } = useAuth();
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [blockReason, setBlockReason] = useState<'NO_PHOTO' | 'TRUST_TOO_LOW' | null>(null);
  // Technically distinct from `blockReason` and from exhaustion: this is a
  // genuine fetch failure (network/server), not "you're out of profiles."
  // Never share copy or state with the exhausted-feed empty state below.
  const [fetchError, setFetchError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Discover -> Quick Peek — never a route change, so closing it returns
  // to exactly the card the user was on. Holds the profile object itself
  // (already fetched) rather than just an id, so the Peek needs no refetch.
  const [peeking, setPeeking] = useState<DiscoverProfile | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const filtersRef = useRef(filters);
  const [dailySignal, setDailySignal] = useState<DailySignal | null>(null);

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Fetch daily signal once on mount — fire-and-forget, no error shown
  useEffect(() => {
    apiGet<DailySignal>('/api/discover/daily-signal')
      .then(d => { if (d.count > 0) setDailySignal(d); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const offset = reset ? 0 : page * 10;
      const { profiles: incoming, exhausted: done } = await fetchProfiles(filtersRef.current, offset);
      setBlockReason(null);
      setFetchError(false);
      if (done) setExhausted(true);
      setProfiles(prev => {
        if (reset) return incoming;
        const existingIds = new Set(prev.map(getUid));
        return [...prev, ...incoming.filter(p => !existingIds.has(getUid(p)))];
      });
      if (!reset) setPage(p => p + 1);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'NO_PHOTO') {
        setBlockReason('NO_PHOTO');
        toast('Add a profile photo to start discovering people', 'info');
      } else if (code === 'TRUST_TOO_LOW') {
        setBlockReason('TRUST_TOO_LOW');
        toast('Set your networking goal in your profile to unlock Discovery', 'info');
      } else {
        if (process.env.NODE_ENV === 'development') {
          setProfiles([SAMPLE_DISCOVER_PROFILE]);
          setFetchError(false);
        } else {
          setFetchError(true);
          toast('Failed to load profiles', 'error');
        }
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
      const res = await apiPost<{ match?: boolean; connectionId?: string | null }>('/api/connect', { userId: uid });
      if (res.match) {
        const pu = (profile.user ?? profile) as { name?: string; photos?: string[] };
        setMatchInfo({ connectionId: res.connectionId ?? null, theirPhoto: pu.photos?.[0], theirName: pu.name ?? 'Someone' });
      } else {
        toast('Interest sent — you\'ll be notified if they connect back', 'success');
      }
      handleSkip(profile, false); // connect already recorded in swipes table
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to connect', 'error');
    }
  }

  function handleSkip(profile: DiscoverProfile, save = true) {
    const uid = getUid(profile);
    if (save && uid) {
      apiPost('/api/skip', { targetId: uid }).catch(() => {});
    }
    const next = profiles.filter(p => getUid(p) !== uid);
    setProfiles(next);
    if (next.length <= 3 && !exhausted && !loading) load(false);
  }

  const router = useRouter();
  const current = profiles[0] ?? null;
  const filterCount = activeFilterCount(filters);

  return (
    <div className="discover-wrap" style={{ flex: 1, minHeight: 0 }}>

      {/* Left column: header + card stack */}
      <div className="discover-left" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Header — canonical inline BYN logo + .disc-header workspace dimensions.
            Restored verbatim from 47fa91b^ (identical to circles/page.tsx and
            DesktopNav.tsx use of `byn-logo-box-sm`). Do not replace with a
            PNG or a different SVG — this IS the canonical BYN logo asset. */}
        <div className="disc-header">
          <div className="disc-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/assets/logo.png" alt="Build Your Network" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
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


        {/* Daily signal — shown only when count > 0 */}
        {dailySignal && (
          <div style={{ padding: '4px 16px 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            {dailySignal.count} new founder{dailySignal.count !== 1 ? 's' : ''}{dailySignal.city ? ` in ${dailySignal.city}` : ''} today
          </div>
        )}

        {/* Filter sheet */}
        <DiscoverFilters
          open={showFilters}
          current={filters}
          onApply={applyFilters}
          onClose={() => setShowFilters(false)}
        />

        {/* Card area */}
        <div className="card-stack-area">

          {loading && !current && <SwipeCardSkeleton />}

          {!loading && !current && blockReason && (
            <div className="disc-empty">
              <div className="disc-empty-icon disc-empty-icon--action">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="10" r="2.75" /><path d="M7 19c0.8-2.6 2.9-4 5-4s4.2 1.4 5 4" />
                </svg>
              </div>
              <h3>{blockReason === 'NO_PHOTO' ? 'Add a photo to start discovering people' : 'Set your networking goal to unlock Discovery'}</h3>
              <p>{blockReason === 'NO_PHOTO'
                ? "A photo is required so the people you match with know who they're talking to."
                : 'Discovery uses your goal to find people who match what you\'re looking for.'}</p>
              <button
                className="retry-btn"
                onClick={() => router.push('/profile')}
              >
                Go to Profile →
              </button>
            </div>
          )}

          {/* Genuine fetch failure — technically and visually distinct from
              "you're out of profiles" below. Never share this branch's
              condition or copy with the exhausted-feed state. */}
          {!loading && !current && !blockReason && fetchError && (
            <div className="disc-empty">
              <div className="disc-empty-icon disc-empty-icon--muted">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4M12 16h.01" /><circle cx="12" cy="12" r="9" />
                </svg>
              </div>
              <h3>Couldn&apos;t load people right now</h3>
              <p>Check your connection and try again.</p>
              <button className="retry-btn" onClick={() => load(true)}>Try again</button>
            </div>
          )}

          {!loading && !current && !blockReason && !fetchError && (
            <div className="disc-empty">
              <div className="disc-empty-icon disc-empty-icon--muted">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <h3>You&apos;ve seen everyone available right now</h3>
              <p>Check back later or widen your filters — new members join every day.</p>
              <button
                className="retry-btn"
                style={{ marginBottom: 10 }}
                onClick={() => router.push('/circles')}
              >
                Explore Circles →
              </button>
              <button className="retry-btn" onClick={() => load(true)}>Refresh</button>
            </div>
          )}

          {current && (
            <SwipeCard
              key={getUid(current)}
              profile={current}
              onConnect={() => handleConnect(current)}
              onSkip={() => handleSkip(current)}
              onInspect={() => setPeeking(current)}
            />
          )}

        </div>
      </div>

      {/* Desktop-only (≥1024px, CSS-gated) — same data as the card, more room.
          This panel already IS Discovery's Peek-equivalent on desktop: an
          always-visible companion showing Why/Building/Looking For/Skills/
          Interests, no tap required. Its own "View full profile" jumps
          straight to the real document — routing it through the Peek
          modal would pop that same content up a second time, on top of
          itself. Only the mobile card's identity tap (no persistent
          sidebar) opens the Peek modal. */}
      {current && <ContextPanel profile={current} onInspect={() => router.push(`/profile/${getUid(current)}`)} />}

      <ProfileInspectOverlay
        profile={peeking}
        onClose={() => setPeeking(null)}
      />

      <MatchModal
        open={!!matchInfo}
        onClose={() => setMatchInfo(null)}
        connectionId={matchInfo?.connectionId ?? null}
        myPhoto={user?.photos?.[0]}
        myName={user?.name ?? 'You'}
        theirPhoto={matchInfo?.theirPhoto}
        theirName={matchInfo?.theirName ?? 'Someone'}
      />
    </div>
  );
}


