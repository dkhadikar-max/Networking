/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useProfileDrawer } from '@/context/ProfileDrawerContext';
import type { LikedMeResponse } from '@/lib/types';

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function LikesPage() {
  const toast = useToast();
  const router = useRouter();
  const { openProfile, closeProfile } = useProfileDrawer();
  const [data, setData] = useState<LikedMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    apiGet<LikedMeResponse>('/api/liked-me')
      .then(r => setData(r))
      .catch(() => toast('Failed to load likes', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function handleConnect(uid: string) {
    setConnecting(uid);
    try {
      const res = await apiPost<{ match?: boolean }>('/api/connect', { userId: uid });
      toast(res.match ? "It's a match! Start the conversation." : 'Interest sent — you\'ll be notified if they connect back', 'success');
      setData(prev => prev ? {
        ...prev,
        profiles: prev.profiles?.filter(p => p.id !== uid),
        count: (prev.count ?? 1) - 1,
      } : prev);
      closeProfile();
    } catch (e) {
      const err = e as { message?: string; status?: number };
      const msg = err.message ?? '';
      if (err.status === 403 && msg.includes('PROFILE_INCOMPLETE')) {
        toast('Complete your profile to send connection requests', 'error');
        router.push('/profile');
      } else if (err.status === 403 && msg.includes('TRUST_TOO_LOW')) {
        toast('Add more profile details to unlock connections', 'error');
        router.push('/profile');
      } else {
        toast(msg || 'Failed to connect', 'error');
      }
    } finally { setConnecting(null); }
  }

  const profiles = data?.profiles ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div className="screen-header">
        <h1>Likes</h1>
        {!loading && (data?.count ?? 0) > 0 && (
          <span style={{ background: 'var(--gold)', color: '#fff', borderRadius: 12, padding: '3px 10px', fontSize: 13, fontWeight: 700 }}>
            {data!.count}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>

        {loading && (
          <div className="loading-center">
            <div className="spinner" />
          </div>
        )}

        {!loading && data?.premium_required && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-lt)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              {data.count ?? 0} {(data.count ?? 0) === 1 ? 'person' : 'people'} liked you
            </h2>
            <p style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 24, maxWidth: 280, lineHeight: 1.55 }}>
              Upgrade to Premium to see who&apos;s interested in connecting with you.
            </p>
            {(data.previews?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
                {data.previews!.slice(0, 3).map((p, i) => (
                  <div key={i} style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', filter: 'blur(4px)', background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                    {p.photos?.[0] ? <img src={p.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(p.name ?? '?')}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push('/profile')}
              style={{ padding: '14px 32px', borderRadius: 'var(--r-md)', background: 'var(--gold)', color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 20px rgba(244,162,89,.3)' }}
            >
              Upgrade to Premium
            </button>
          </div>
        )}

        {!loading && !data?.premium_required && profiles.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No likes yet</h3>
            <p style={{ fontSize: 14, color: 'var(--sub)' }}>Complete your profile and start connecting to get noticed</p>
          </div>
        )}

        {!loading && !data?.premium_required && profiles.length > 0 && (
          <>
            {profiles.map(profile => (
              <div
                key={profile.id}
                className="chat-row"
                onClick={() => openProfile(profile, {
                  onConnect: async () => { await handleConnect(profile.id); },
                })}
              >
                <div className="chat-av-wrap">
                  <div className="chat-av">
                    {profile.photos?.[0]
                      ? <img src={profile.photos[0]} alt={profile.name} />
                      : initials(profile.name ?? '?')}
                  </div>
                  {profile.is_online && <span className="chat-online" />}
                </div>
                <div className="chat-body">
                  <div className="chat-name-row">
                    <span className="chat-name">{profile.name}</span>
                  </div>
                  {profile.headline && (
                    <p className="chat-preview">{profile.headline}</p>
                  )}
                  {profile.matchScore != null && (
                    <p style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>
                      {profile.matchScore}% match
                    </p>
                  )}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleConnect(profile.id); }}
                  disabled={connecting === profile.id}
                  style={{
                    padding: '9px 16px', borderRadius: 'var(--r-sm)',
                    background: 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                    color: 'white', fontSize: 13, fontWeight: 700,
                    border: 'none', cursor: connecting === profile.id ? 'not-allowed' : 'pointer',
                    flexShrink: 0, opacity: connecting === profile.id ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {connecting === profile.id ? '…' : 'Connect'}
                </button>
              </div>
            ))}
          </>
        )}

      </div>
    </div>
  );
}
