'use client';

import Image from 'next/image';
import { useState } from 'react';
import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import type { User } from '@/lib/types';

type Props = {
  user: User;
  isSelf?: boolean;
  onConnect?: () => Promise<void>;
  connected?: boolean;
  onEdit?: () => void;
};

export default function ProfileView({ user, isSelf = false, onConnect, connected, onEdit }: Props) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const photos = user.photos ?? [];

  async function handleConnect() {
    if (!onConnect) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden shadow-[var(--shadow-sm)]">
          {photos.length > 0 ? (
            <div className="relative aspect-[3/2] bg-[var(--light)]">
              <Image src={photos[photoIdx]} alt={user.name} fill className="object-cover" unoptimized />
              {photos.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${i === photoIdx ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[3/2] bg-[var(--light)] flex items-center justify-center">
              <Avatar src={null} name={user.name} size={100} />
            </div>
          )}

          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-[var(--text)]">{user.name}</h1>
                  {user.verified && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--primary)">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  )}
                </div>
                {user.headline && <p className="text-sm text-[var(--sub)] mt-0.5">{user.headline}</p>}
                {user.location && (
                  <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                    {user.location}
                  </p>
                )}
              </div>

              {isSelf ? (
                <Button variant="secondary" onClick={onEdit}>Edit profile</Button>
              ) : (
                <Button onClick={handleConnect} loading={connecting} disabled={connected}>
                  {connected ? 'Connected' : 'Connect'}
                </Button>
              )}
            </div>

            {/* Social links */}
            <div className="flex gap-3 mt-4">
              {user.linkedin && (
                <a href={user.linkedin} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                </a>
              )}
              {user.website && (
                <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </a>
              )}
              {user.instagram && (
                <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {isSelf && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-[var(--border)] p-4 text-center">
              <p className="text-2xl font-bold text-[var(--primary)]">{user.profile_score ?? 0}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">Profile score</p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--border)] p-4 text-center">
              <p className="text-2xl font-bold text-[var(--primary)]">{user.trust_score ?? 0}</p>
              <p className="text-xs text-[var(--muted)] mt-0.5">Trust score</p>
            </div>
          </div>
        )}

        {/* About */}
        {user.bio && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">About</h2>
            <p className="text-sm text-[var(--sub)] leading-relaxed">{user.bio}</p>
          </div>
        )}

        {/* Working on */}
        {user.working_on && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Working on</h2>
            <p className="text-sm text-[var(--sub)] leading-relaxed">{user.working_on}</p>
          </div>
        )}

        {/* Currently exploring */}
        {user.currently_exploring && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Currently exploring</h2>
            <p className="text-sm text-[var(--sub)] leading-relaxed">{user.currently_exploring}</p>
          </div>
        )}

        {/* Interests */}
        {(user.interests?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {user.interests!.map(tag => (
                <span key={tag} className="px-3 py-1 rounded-full bg-[var(--light)] text-[var(--primary)] text-xs font-medium">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {(user.skills?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {user.skills!.map(s => (
                <span key={s} className="px-3 py-1 rounded-full bg-[var(--sur2)] text-[var(--text)] text-xs font-medium border border-[var(--border)]">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Photos grid */}
        {photos.length > 1 && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Photos</h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)} className="relative aspect-square rounded-xl overflow-hidden">
                  <Image src={p} alt="" fill className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open chat button for non-self connected profiles */}
        {!isSelf && connected && (
          <Link href="/chat" className="w-full">
            <Button fullWidth variant="secondary">Open chat</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
