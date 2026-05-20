'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';

export type ModalProfile = {
  id?: string;
  name?: string;
  photos?: string[];
  headline?: string;
  bio?: string;
  location?: string;
  interests?: string[];
  skills?: string[];
  working_on?: string;
  currently_exploring?: string;
  linkedin?: string;
  website?: string;
  instagram?: string;
  verified?: boolean;
  is_online?: boolean;
  match_score?: number;
  matchScore?: number;
  connection?: { id: string };
  user?: ModalProfile;
};

type Props = {
  profile: ModalProfile | null;
  onClose: () => void;
  onConnect?: () => Promise<void>;
  onSkip?: () => void;
};

export default function ProfileModal({ profile, onClose, onConnect, onSkip }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  const uid = profile?.user?.id ?? profile?.id;
  useEffect(() => { setPhotoIdx(0); }, [uid]);

  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [profile, onClose]);

  // Flatten nested user shape (DiscoverProfile wraps user, ChatWindow passes User directly)
  const raw = profile?.user ?? profile;
  const connected = !!profile?.connection;
  const score = profile?.match_score ?? profile?.matchScore;

  const name = raw?.name ?? 'Unknown';
  const photos = raw?.photos ?? [];

  async function handleConnect() {
    if (!onConnect || connected) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <AnimatePresence>
      {profile && (
        <motion.div
          key="profile-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[500] bg-black/60 flex items-end lg:items-center lg:justify-center lg:p-6"
          onClick={onClose}
        >
          <motion.div
            key="profile-modal-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="w-full bg-white rounded-t-3xl lg:rounded-2xl lg:max-w-lg max-h-[92vh] lg:max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="lg:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Photo */}
              <div className="relative h-56 bg-[var(--light)] shrink-0">
                {photos[photoIdx] ? (
                  <Image src={photos[photoIdx]} alt={name} fill className="object-cover" unoptimized />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Avatar src={null} name={name} size={80} />
                  </div>
                )}

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

                {score != null && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[var(--primary)] text-white text-xs font-bold shadow">
                    {score}% match
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  aria-label="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Info */}
              <div className="p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-[var(--text)]">{name}</h2>
                    {raw?.verified && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--primary)">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                    )}
                  </div>
                  {raw?.headline && <p className="text-sm text-[var(--sub)] mt-0.5">{raw.headline}</p>}
                  {raw?.location && (
                    <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      {raw.location}
                    </p>
                  )}
                </div>

                {raw?.bio && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">About</p>
                    <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.bio}</p>
                  </div>
                )}

                {raw?.working_on && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Working on</p>
                    <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.working_on}</p>
                  </div>
                )}

                {raw?.currently_exploring && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Exploring</p>
                    <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.currently_exploring}</p>
                  </div>
                )}

                {(raw?.interests?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {raw!.interests!.map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-full bg-[var(--light)] text-[var(--primary)] text-xs font-medium">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {(raw?.skills?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {raw!.skills!.map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-full bg-[var(--sur2)] text-[var(--text)] text-xs font-medium border border-[var(--border)]">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Social links */}
                {(raw?.linkedin || raw?.website || raw?.instagram) && (
                  <div className="flex gap-3 pt-1">
                    {raw.linkedin && (
                      <a href={raw.linkedin} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                      </a>
                    )}
                    {raw.website && (
                      <a href={raw.website} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      </a>
                    )}
                    {raw.instagram && (
                      <a href={`https://instagram.com/${raw.instagram}`} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                      </a>
                    )}
                  </div>
                )}

                {/* Bottom padding so content clears the safe area on mobile */}
                <div className="h-2" />
              </div>
            </div>

            {/* Action bar — only rendered when connect/skip are provided (discover context) */}
            {(onConnect || onSkip) && (
              <div className="flex gap-3 p-4 border-t border-[var(--border)] bg-white shrink-0"
                   style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                {onSkip && (
                  <button
                    onClick={onSkip}
                    className="flex-1 py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--sub)] hover:bg-[var(--sur2)] transition-colors"
                  >
                    Skip
                  </button>
                )}
                {onConnect && (
                  <Button onClick={handleConnect} loading={connecting} disabled={connected} className="flex-1">
                    {connected ? 'Connected' : 'Connect'}
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
