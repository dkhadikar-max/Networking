/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useProfileDrawer } from '@/context/ProfileDrawerContext';
import SwipeCard from './SwipeCard';
import DiscoverFilters, { DEFAULT_FILTERS, activeFilterCount } from './DiscoverFilters';
import type { FilterState } from './DiscoverFilters';
import type { DiscoverProfile } from '@/lib/types';

type ApiResponse = { profiles: DiscoverProfile[] };

type RightPanelProps = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
};

function DiscoverRightPanel({ profile, onConnect, onSkip }: RightPanelProps) {
  const [connecting, setConnecting] = useState(false);
  const raw = (profile.user ?? profile) as import('@/lib/types').User;
  const name = raw?.name ?? 'Unknown';
  const photos = (raw?.photos ?? []) as string[];
  const score = profile.matchScore ?? profile.match_score;
  const connected = !!profile.connection;

  async function handleConnect() {
    if (connected) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 16px' }}>

        {/* Photo */}
        <div style={{
          width: '100%', height: 280, borderRadius: 20, overflow: 'hidden',
          background: 'linear-gradient(135deg,#D8FAF2,#FEE9D1)', flexShrink: 0,
          position: 'relative', marginBottom: 20,
        }}>
          {photos[0] ? (
            <img src={photos[0]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, fontWeight: 800, color: '#157A6E', letterSpacing: '-0.04em' }}>
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          {score != null && (
            <div style={{ position: 'absolute', top: 14, right: 14, background: 'var(--primary)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
              {score}% match
            </div>
          )}
        </div>

        {/* Name + role */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>{name}</div>
          {raw?.headline && <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 5 }}>{raw.headline}</div>}
          {raw?.location && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {raw.location}
            </div>
          )}
        </div>

        {/* Bio */}
        {raw?.bio && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>About</div>
            <div style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65 }}>{raw.bio}</div>
          </div>
        )}

        {/* Interests */}
        {(raw?.interests?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>Interests</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(raw!.interests as string[]).slice(0, 10).map(tag => (
                <span key={tag} className="chip">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {(raw?.skills?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>Skills</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(raw!.skills as string[]).slice(0, 8).map(s => (
                <span key={s} style={{ padding: '6px 13px', borderRadius: 999, background: 'var(--sur2)', color: 'var(--text-soft)', fontSize: 12, fontWeight: 600, border: '1px solid var(--border)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '14px 24px 24px', borderTop: '1px solid var(--border)', background: 'white', flexShrink: 0 }}>
        <div className="card-actions" style={{ padding: 0, maxWidth: '100%' }}>
          <button className="action-btn action-skip" onClick={onSkip}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            Skip
          </button>
          <button
            className="action-btn action-connect"
            onClick={handleConnect}
            disabled={connecting || connected}
            style={{ flex: 2, opacity: (connecting || connected) ? 0.6 : 1 }}
          >
            {connected ? 'Connected' : connecting ? 'Connecting…' : '→ Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const { openProfile, updateDrawerProfile } = useProfileDrawer();
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
    } catch {
      toast('Failed to load profiles', 'error');
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
              onSelect={() => openProfile(current, {
                onConnect: () => handleConnect(current),
                onSkip: () => handleSkip(current),
              })}
            />
          )}

        </div>
      </div>

      {/* Right column — desktop only (hidden via CSS on mobile/tablet) */}
      <div className="disc-right">
        {current ? (
          <DiscoverRightPanel
            profile={current}
            onConnect={() => handleConnect(current)}
            onSkip={() => handleSkip(current)}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', gap: 12, padding: 40 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.5, maxWidth: 200 }}>Swipe through profiles to see their details here</p>
          </div>
        )}
      </div>

    </div>
  );
}
