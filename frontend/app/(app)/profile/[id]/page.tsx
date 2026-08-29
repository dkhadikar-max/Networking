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
      .catch(() => {
        if (process.env.NODE_ENV === 'development') {
          setProfile({
            id: String(id),
            name: 'Aarav Sharma',
            email: 'aarav@neuroflow.ai',
            email_verified: true,
            onboarding_stage: 'complete',
            headline: 'Founder & CEO @ NeuroFlow · Bengaluru',
            location: 'Bengaluru, India',
            intent: 'find-cofounder',
            trust_score: 95,
            verified: true,
            working_on: 'Autonomous energy grid optimization network built with edge AI models. Deploying decentralized real-time inference nodes to dynamically balance municipal power distribution across regional smart grids.',
            currently_exploring: 'A world-class Principal Frontend Engineer & Design Partner obsessed with high-framerate data visualizations, WebGL telemetry dashboards, and reactive system architecture.',
            bio: 'Serial builder and systems architect passionate about edge computing, real-time grid orchestration, and high-framerate interfaces. Previously scaled streaming pipelines at Gridlytics handling 40M+ daily events. Looking for someone with deep frontend taste to build our core interface from zero to one.',
            skills: ['Distributed Systems', 'PyTorch', 'Next.js', 'System Architecture', 'Edge AI Models', 'TypeScript', 'WebGL'],
            interests: ['Autonomous AI', 'Climate Tech', 'Distributed Systems', 'High-Framerate UX', 'Clean Energy'],
            photos: ['/assets/sample-founder-1.jpg'],
          } as ProfileData);
        } else {
          toast('Profile not found', 'error');
        }
      })
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
