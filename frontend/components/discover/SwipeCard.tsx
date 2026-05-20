'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import type { DiscoverProfile } from '@/lib/types';

type Props = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
  onSelect: () => void;
};

export default function SwipeCard({ profile, onConnect, onSkip, onSelect }: Props) {
  const user = profile.user ?? profile;
  const name = (user as { name?: string }).name ?? 'Unknown';
  const photos: string[] = (user as { photos?: string[] }).photos ?? [];
  const headline = (user as { headline?: string }).headline;
  const location = (user as { location?: string }).location;
  const bio = (user as { bio?: string }).bio;
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];
  const score = profile.match_score ?? profile.matchScore;
  const connected = !!profile.connection;

  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    if (connected) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  function handleSkip(e: React.MouseEvent) {
    e.stopPropagation();
    onSkip();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-white rounded-2xl shadow-[var(--shadow-sm)] border border-[var(--border)] overflow-hidden cursor-pointer select-none"
      onClick={onSelect}
    >
      {/* Photo strip */}
      <div className="relative aspect-[4/3] bg-[var(--light)]">
        <AnimatePresence mode="wait">
          {photos[photoIdx] ? (
            <motion.div
              key={photoIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <Image
                src={photos[photoIdx]}
                alt={name}
                fill
                className="object-cover"
                unoptimized
              />
            </motion.div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Avatar src={null} name={name} size={80} />
            </div>
          )}
        </AnimatePresence>

        {/* Photo dots */}
        {photos.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setPhotoIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === photoIdx ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        )}

        {/* Match score badge */}
        {score != null && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[var(--primary)] text-white text-xs font-bold shadow">
            {score}% match
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-[var(--text)] text-base leading-tight">{name}</h3>
            {location && <span className="text-xs text-[var(--muted)] shrink-0 mt-0.5">{location}</span>}
          </div>
          {headline && <p className="text-sm text-[var(--sub)] mt-0.5 leading-snug">{headline}</p>}
        </div>

        {bio && (
          <p className="text-sm text-[var(--sub)] leading-relaxed line-clamp-2">{bio}</p>
        )}

        {interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {interests.slice(0, 4).map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-[var(--light)] text-[var(--primary)] text-xs font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSkip}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors"
          >
            Skip
          </button>
          <Button
            onClick={handleConnect}
            loading={connecting}
            disabled={connected}
            className="flex-1"
          >
            {connected ? 'Connected' : 'Connect'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
