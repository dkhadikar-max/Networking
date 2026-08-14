'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import { apiGet } from '@/lib/api';
import ProfileView from '@/components/profile/ProfileView';
import type { User } from '@/lib/types';

// The Discover -> Profile transition: opened from the card's identity row
// or the desktop context panel, never a route change. `/discover` never
// unmounts underneath this — closing is instant and the swipe stack is
// exactly as the user left it. Renders the real, canonical ProfileView —
// this is presentation chrome around it, not a second profile.
type ProfileData = User;

type Props = {
  userId: string | null;
  onClose: () => void;
  onConnect: () => Promise<void>;
};

export default function ProfileInspectOverlay({ userId, onClose, onConnect }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const t = (normal: Transition): Transition => (reduceMotion ? { duration: 0 } : normal);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setProfile(null);
    apiGet<ProfileData>(`/api/profiles/${userId}`)
      .then(r => { if (!cancelled) setProfile(r); })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [userId, onClose]);

  async function handleConnect() {
    await onConnect();
    // onConnect (DiscoverFeed's handleConnect) already advances the card /
    // shows MatchModal — close so the user lands back on Discover to see it.
    onClose();
  }

  return (
    <AnimatePresence>
      {userId && (
        <>
          <motion.div
            className="inspect-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t({ duration: 0.18 })}
            onClick={onClose}
          />
          <motion.div
            className="inspect-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-label={profile?.name ? `${profile.name}'s profile` : 'Profile'}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={t({ type: 'spring', damping: 32, stiffness: 300 })}
            onClick={e => e.stopPropagation()}
          >
            <div className="inspect-overlay-handle" />
            <div className="inspect-overlay-header">
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Profile</span>
              <button ref={closeBtnRef} className="inspect-overlay-close" onClick={onClose} aria-label="Close profile">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="inspect-overlay-body">
              {loading && (
                <div className="inspect-overlay-loading"><div className="spinner" /></div>
              )}
              {!loading && notFound && (
                <div className="inspect-overlay-error">
                  <p style={{ fontSize: 14, color: 'var(--muted)' }}>Profile not found</p>
                </div>
              )}
              {!loading && profile && (
                <ProfileView
                  user={profile}
                  isSelf={false}
                  connected={profile.is_connected}
                  onConnect={handleConnect}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
