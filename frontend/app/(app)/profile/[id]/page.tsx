'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import ProfileView from '@/components/profile/ProfileView';
import type { User } from '@/lib/types';

type ProfileData = User & { connection?: { id: string } };

export default function OtherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ProfileData>(`/api/profiles/${id}`)
      .then(r => setProfile(r))
      .catch(() => toast('Profile not found', 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  async function handleConnect() {
    if (!profile) return;
    try {
      await apiPost('/api/connect', { userId: profile.id });
      setProfile(prev => prev ? { ...prev, connection: { id: 'pending' } } : prev);
      toast('Connection request sent!', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to connect', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8 text-[var(--muted)]">
        <p className="text-sm">Profile not found</p>
      </div>
    );
  }

  const isSelf = me?.id === profile.id;

  return (
    <ProfileView
      user={profile}
      isSelf={isSelf}
      connected={!!profile.connection}
      connectionId={profile.connection?.id}
      onConnect={isSelf ? undefined : handleConnect}
      onEdit={isSelf ? () => router.replace('/profile') : undefined}
    />
  );
}
