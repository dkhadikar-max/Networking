'use client';

import { useEffect, useState } from 'react';
import { apiGet, getToken } from '@/lib/api';
import { computeSignals, networkMomentumScore } from '@/lib/retention/signals';
import { buildRecommendations } from '@/lib/retention/recommendations';
import { requestNotificationPermission, scheduleRetentionCheck } from '@/lib/retention/notifications';
import DailyRecommendations from '@/components/retention/DailyRecommendations';
import NetworkMomentum from '@/components/retention/NetworkMomentum';
import CollaborationAlerts from '@/components/retention/CollaborationAlerts';
import MutualOpportunities from '@/components/retention/MutualOpportunities';
import type { Connection, ProfileStatus, UserProfile } from '@/lib/retention/signals';
import type { Recommendation } from '@/lib/retention/recommendations';

interface LikedMeResponse { count: number; profiles: unknown[] }

export default function RetentionPage() {
  const [loading, setLoading]               = useState(true);
  const [profile, setProfile]               = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus]   = useState<ProfileStatus | null>(null);
  const [connections, setConnections]       = useState<Connection[]>([]);
  const [likedMeCount, setLikedMeCount]     = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [momentumScore, setMomentumScore]   = useState(0);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { window.location.href = '/'; return; }

    Promise.all([
      apiGet<UserProfile>('/api/me'),
      apiGet<ProfileStatus>('/api/profile-status'),
      apiGet<Connection[]>('/api/connections'),
      apiGet<LikedMeResponse>('/api/liked-me'),
    ])
      .then(([me, status, conns, liked]) => {
        setProfile(me);
        setProfileStatus(status);
        setConnections(conns);
        setLikedMeCount(liked.count);

        const signals = computeSignals(me, status, conns, liked.count);
        const recs    = buildRecommendations(signals);
        const score   = networkMomentumScore(me, conns, status);

        setRecommendations(recs);
        setMomentumScore(score);

        requestNotificationPermission().then(() => scheduleRetentionCheck(recs));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const staleConns = connections.filter(c => {
    const lastAt = c.lastMessage
      ? new Date(c.lastMessage.created_at).getTime()
      : new Date(c.connection.expires_at).getTime() - 7 * 86400000;
    return (Date.now() - lastAt) / 86400000 >= 7;
  });

  const activeConversations = connections.filter(c => c.msgCount > 0).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-red-500 font-medium">{error}</p>
          <a href="/" className="text-sm text-[var(--primary)] mt-2 block hover:underline">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-10 bg-[var(--bg)] border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <a href="https://buildyournetwork.online" className="font-bold text-[var(--primary)] text-lg">BYN</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              Hi, {profile?.name?.split(' ')[0] ?? 'there'} 👋
            </span>
            <a
              href="https://buildyournetwork.online/webapp.html"
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary-dark)] transition-colors"
            >
              Open app
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Momentum gauge */}
        {profileStatus && profile && (
          <NetworkMomentum
            score={momentumScore}
            connections={connections.length}
            activeConversations={activeConversations}
            profileScore={profileStatus.profile_score}
          />
        )}

        {/* Daily recommendations */}
        <DailyRecommendations recommendations={recommendations} />

        {/* Stale connections */}
        {staleConns.length > 0 && (
          <CollaborationAlerts staleConnections={staleConns} />
        )}

        {/* Collaboration opportunities */}
        {profile && connections.length > 0 && (
          <MutualOpportunities
            connections={connections}
            userInterests={profile.interests ?? []}
          />
        )}
      </main>
    </div>
  );
}
