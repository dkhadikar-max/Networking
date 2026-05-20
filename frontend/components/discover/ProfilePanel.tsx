'use client';

import Image from 'next/image';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import type { DiscoverProfile } from '@/lib/types';

type Props = {
  profile: DiscoverProfile | null;
  onConnect: () => Promise<void>;
  onSkip: () => void;
  onClose: () => void;
};

export default function ProfilePanel({ profile, onConnect, onSkip, onClose }: Props) {
  const [connecting, setConnecting] = useState(false);

  if (!profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--muted)]">
        <div className="w-16 h-16 rounded-full bg-[var(--light)] flex items-center justify-center mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <p className="text-sm">Select a profile to view details</p>
      </div>
    );
  }

  const user = profile.user ?? profile;
  const name = (user as { name?: string }).name ?? 'Unknown';
  const photos: string[] = (user as { photos?: string[] }).photos ?? [];
  const headline = (user as { headline?: string }).headline;
  const location = (user as { location?: string }).location;
  const bio = (user as { bio?: string }).bio;
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];
  const skills: string[] = (user as { skills?: string[] }).skills ?? [];
  const workingOn = (user as { working_on?: string }).working_on;
  const currentlyExploring = (user as { currently_exploring?: string }).currently_exploring;
  const score = profile.match_score ?? profile.matchScore;
  const connected = !!profile.connection;

  async function handleConnect() {
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={(user as { id?: string }).id}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.2 }}
        className="h-full flex flex-col overflow-hidden"
      >
        {/* Header photo */}
        <div className="relative h-56 bg-[var(--light)] shrink-0">
          {photos[0] ? (
            <Image src={photos[0]} alt={name} fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Avatar src={null} name={name} size={96} />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          {score != null && (
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-[var(--primary)] text-white text-xs font-bold shadow">
              {score}% match
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--text)]">{name}</h2>
            {headline && <p className="text-sm text-[var(--sub)] mt-0.5">{headline}</p>}
            {location && (
              <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                {location}
              </p>
            )}
          </div>

          {bio && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">About</h3>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{bio}</p>
            </div>
          )}

          {workingOn && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Working on</h3>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{workingOn}</p>
            </div>
          )}

          {currentlyExploring && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Currently exploring</h3>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{currentlyExploring}</p>
            </div>
          )}

          {interests.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Interests</h3>
              <div className="flex flex-wrap gap-1.5">
                {interests.map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-full bg-[var(--light)] text-[var(--primary)] text-xs font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {skills.map(s => (
                  <span key={s} className="px-2.5 py-1 rounded-full bg-[var(--sur2)] text-[var(--text)] text-xs font-medium border border-[var(--border)]">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Photo strip */}
          {photos.length > 1 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Photos</h3>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                    <Image src={p} alt="" fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="p-4 border-t border-[var(--border)] flex gap-3 shrink-0">
          <button
            onClick={onSkip}
            className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors"
          >
            Skip
          </button>
          <Button onClick={handleConnect} loading={connecting} disabled={connected} className="flex-1">
            {connected ? 'Connected' : 'Connect'}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
