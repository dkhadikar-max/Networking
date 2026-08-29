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
      // Same "not found" handling in every environment — a dev-only
      // fabricated "Aarav Sharma" fallback used to stand in here, the one
      // remaining fake-identity substitution left over from the
      // 2026-08-29/30 Profile↔Discovery IA work. A failed fetch now always
      // means a real "profile not found" state, never a substitute person.
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
      <div role="status" aria-live="polite" className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/50">
        <div className="w-9 h-9 rounded-full border-3 border-[#157A6E] border-t-transparent animate-spin mb-2" aria-hidden="true" />
        <span className="text-xs font-semibold text-slate-400">Loading profile…</span>
      </div>
    );
  }

  // Same deliberate visual language as ChatWindow's "Conversation Not
  // Found" state — icon, heading, description, a way back — rather than
  // a bare line of text.
  if (!profile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 text-slate-400">
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-xl mb-2 shadow-xs">
          🔍
        </div>
        <h3 className="font-bold text-sm text-slate-700 mb-1">Profile Not Found</h3>
        <p className="text-xs max-w-xs">This profile may have been removed or the link is no longer valid.</p>
        <button
          onClick={() => router.push('/discover')}
          className="mt-4 px-4 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          ← Back to Discover
        </button>
      </div>
    );
  }

  const isSelf = me?.id === profile.id;
  // `is_connected` (server, reflects a pre-existing connection) OR
  // `connection` (local-only optimistic state set right after a fresh
  // Connect click below) — `!!profile.connection` alone was always false
  // on initial load, since the API never actually returns a `connection`
  // field; it only returns `is_connected`.
  const connected = !!profile.is_connected || !!profile.connection;

  return (
    <ProfileView
      user={profile}
      isSelf={isSelf}
      connected={connected}
      connectionId={profile.connection?.id}
      onConnect={isSelf ? undefined : handleConnect}
      onEdit={isSelf ? () => router.replace('/profile') : undefined}
    />
  );
}
