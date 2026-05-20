'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import ProfileDrawer, { type DrawerProfile } from '@/components/ui/ProfileDrawer';
import type { LikedMeResponse, User } from '@/lib/types';

type LikedProfile = User & { matchScore?: number };

export default function LikesPage() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<LikedMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [selected, setSelected] = useState<LikedProfile | null>(null);

  useEffect(() => {
    apiGet<LikedMeResponse>('/api/liked-me')
      .then(r => setData(r))
      .catch(() => toast('Failed to load likes', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function handleConnect(uid: string) {
    setConnecting(uid);
    try {
      await apiPost('/api/connect', { userId: uid });
      toast('Connection request sent!', 'success');
      setData(prev => prev ? {
        ...prev,
        profiles: prev.profiles?.filter(p => p.id !== uid),
        count: (prev.count ?? 1) - 1,
      } : prev);
      setSelected(prev => prev?.id === uid ? null : prev);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally { setConnecting(null); }
  }

  const profiles: LikedProfile[] = data?.profiles ?? [];

  // ONE stable outer container for all states — loading / premium / empty / list.
  return (
    <div className="flex flex-1 min-h-0 relative overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-col">

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          </div>
        )}

        {/* Premium gate */}
        {!loading && data?.premium_required && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="max-w-sm space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--accent-lt)] flex items-center justify-center mx-auto">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--text)]">
                  {data.count ?? 0} {(data.count ?? 0) === 1 ? 'person' : 'people'} liked you
                </h2>
                <p className="text-sm text-[var(--sub)] mt-2">Upgrade to Premium to see who&apos;s interested in connecting with you.</p>
              </div>
              {(data.previews?.length ?? 0) > 0 && (
                <div className="flex justify-center gap-2 py-2">
                  {data.previews!.slice(0, 3).map((p, i) => (
                    <div key={i} className="relative">
                      <Avatar src={p.photos?.[0]} name={p.name ?? '?'} size={56} className="blur-sm" />
                    </div>
                  ))}
                </div>
              )}
              <Button variant="gold" fullWidth onClick={() => router.push('/profile')}>
                Upgrade to Premium
              </Button>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && !data?.premium_required && profiles.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <div className="w-16 h-16 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <h3 className="font-bold text-[var(--text)] mb-1">No likes yet</h3>
              <p className="text-sm text-[var(--sub)]">Complete your profile and start connecting to get noticed</p>
            </div>
          </div>
        )}

        {/* Profile list */}
        {!loading && !data?.premium_required && profiles.length > 0 && (
          <div className="max-w-2xl mx-auto px-4 py-6 w-full">
            <h1 className="text-xl font-bold text-[var(--text)] mb-1">People who liked you</h1>
            <p className="text-sm text-[var(--sub)] mb-5">
              {profiles.length} {profiles.length === 1 ? 'person' : 'people'} want to connect
            </p>
            <div className="space-y-3">
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  className="flex items-center gap-4 bg-white rounded-xl border border-[var(--border)] p-4 shadow-[var(--shadow-sm)] hover:border-[var(--primary)] transition-colors cursor-pointer"
                  onClick={() => setSelected(profile)}
                >
                  <Avatar src={profile.photos?.[0]} name={profile.name} size={52} online={profile.is_online} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text)] truncate">{profile.name}</p>
                    {profile.headline && <p className="text-xs text-[var(--sub)] truncate mt-0.5">{profile.headline}</p>}
                    {profile.matchScore != null && (
                      <p className="text-xs text-[var(--primary)] font-semibold mt-1">{profile.matchScore}% match</p>
                    )}
                  </div>
                  <Button
                    onClick={e => { e.stopPropagation(); handleConnect(profile.id); }}
                    loading={connecting === profile.id}
                    className="shrink-0"
                  >
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Right-side contextual drawer */}
      <ProfileDrawer
        profile={selected as DrawerProfile | null}
        onClose={() => setSelected(null)}
        onConnect={selected ? async () => handleConnect(selected.id) : undefined}
      />
    </div>
  );
}
