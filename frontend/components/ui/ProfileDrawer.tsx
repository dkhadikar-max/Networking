'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { formatIntent } from '@/lib/intent';

function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch { return undefined; }
}

export type DrawerProfile = {
  id?: string;
  name?: string;
  photos?: string[];
  headline?: string;
  bio?: string;
  location?: string;
  intent?: string;
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
  trust_score?: number;
  insight?: string;
  connection?: { id: string };
  user?: DrawerProfile;
};

type Props = {
  profile: DrawerProfile | null;
  onClose: () => void;
  onConnect?: () => Promise<void>;
  onSkip?: () => void;
};

export default function ProfileDrawer({ profile, onClose, onConnect, onSkip }: Props) {
  const [connecting, setConnecting] = useState(false);
  const uid = profile?.user?.id ?? profile?.id;
  const [photoState, setPhotoState] = useState<{ uid: string | undefined; idx: number }>({ uid, idx: 0 });
  const photoIdx = photoState.uid === uid ? photoState.idx : 0;
  function setPhotoIdx(idx: number) { setPhotoState({ uid, idx }); }

  useEffect(() => {
    if (!profile) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [profile, onClose]);

  const raw = profile?.user ?? profile;
  const connected = !!profile?.connection;
  const score = profile?.match_score ?? profile?.matchScore;
  const trustScore = profile?.trust_score ?? (profile?.user as DrawerProfile | undefined)?.trust_score;
  const insight = profile?.insight ?? (profile?.user as DrawerProfile | undefined)?.insight;
  const name = raw?.name ?? 'Unknown';
  const photos = raw?.photos ?? [];
  const profileId = raw?.id;

  async function handleConnect() {
    if (!onConnect || connected) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  const panelBody = profile ? (
    <>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Photo with overlaid controls */}
        <div className="relative bg-[var(--light)] shrink-0" style={{ height: 280 }}>
          {photos[photoIdx] ? (
            <Image src={photos[photoIdx]} alt={name} fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Avatar src={null} name={name} size={72} />
            </div>
          )}

          {/* Gradient scrim so overlay controls are always legible */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

          {/* Close — top-left */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Badges — top-right */}
          {(trustScore != null || score != null) && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {trustScore != null && (
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: trustScore >= 70 ? 'rgba(235,249,245,0.95)' : 'rgba(255,255,255,0.88)',
                  color: trustScore >= 70 ? 'var(--primary)' : 'var(--muted)',
                  border: '1px solid',
                  borderColor: trustScore >= 70 ? 'var(--primary)' : 'var(--border)',
                }}>
                  {trustScore >= 70 ? '✓ Trusted' : `Trust ${trustScore}`}
                </span>
              )}
              {score != null && (
                <span className="px-2.5 py-1 rounded-full bg-[var(--primary)] text-white text-xs font-bold shadow">
                  {score}% match
                </span>
              )}
            </div>
          )}

          {/* Photo pagination dots */}
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIdx(i)}
                  style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                  className={`w-2 h-2 rounded-full transition-colors ${i === photoIdx ? 'bg-white' : 'bg-white/55'}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-[var(--text)]" style={{ letterSpacing: '-0.03em' }}>{name}</h2>
              {raw?.verified && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--primary)">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            {raw?.headline && <p className="text-sm text-[var(--sub)] mt-0.5">{raw.headline}</p>}
            {raw?.location && (
              <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-1">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {raw.location}
              </p>
            )}
          </div>

          {raw?.intent && (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'linear-gradient(135deg,#D5F5EE,#EDF9FF)', border: '1px solid #B8EDE5' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>Looking for</div>
              <span style={{ padding: '4px 12px', borderRadius: 999, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700 }}>{formatIntent(raw.intent)}</span>
            </div>
          )}
          {insight && (
            <div style={{ padding: '8px 12px', background: 'var(--light)', borderRadius: 10, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
              ✦ {insight}
            </div>
          )}
          {raw?.bio && (
            <div>
              <p className="text-sm font-bold text-[var(--text-soft)] mb-1.5">About</p>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.bio}</p>
            </div>
          )}
          {raw?.working_on && (
            <div>
              <p className="text-sm font-bold text-[var(--text-soft)] mb-1.5">Working on</p>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.working_on}</p>
            </div>
          )}
          {raw?.currently_exploring && (
            <div>
              <p className="text-sm font-bold text-[var(--text-soft)] mb-1.5">Exploring</p>
              <p className="text-sm text-[var(--sub)] leading-relaxed">{raw.currently_exploring}</p>
            </div>
          )}
          {(raw?.interests?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm font-bold text-[var(--text-soft)] mb-2">Interests</p>
              <div className="flex flex-wrap gap-1.5">
                {raw!.interests!.map(tag => (
                  <span key={tag} className="chip">{tag}</span>
                ))}
              </div>
            </div>
          )}
          {(raw?.skills?.length ?? 0) > 0 && (
            <div>
              <p className="text-sm font-bold text-[var(--text-soft)] mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {raw!.skills!.map(s => (
                  <span key={s} className="chip chip-gold">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(raw?.linkedin || raw?.website || raw?.instagram) && (
            <div className="flex gap-3 pt-1">
              {safeHref(raw.linkedin) && (
                <a href={safeHref(raw.linkedin)} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" /></svg>
                </a>
              )}
              {safeHref(raw.website) && (
                <a href={safeHref(raw.website)} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                </a>
              )}
              {raw.instagram && (
                <a href={`https://instagram.com/${raw.instagram}`} target="_blank" rel="noopener noreferrer" className="text-[var(--sub)] hover:text-[var(--primary)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
                </a>
              )}
            </div>
          )}
          <div className="h-2" />
        </div>
      </div>

      {/* Action bar — discover context */}
      {(onConnect || onSkip) && (
        <div
          style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'white', flexShrink: 0, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
        >
          <div className="card-actions" style={{ padding: 0, maxWidth: '100%' }}>
            {onSkip && (
              <button className="action-btn action-skip" onClick={onSkip}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                Skip
              </button>
            )}
            {onConnect && (
              <button
                className="action-btn action-connect"
                onClick={handleConnect}
                disabled={connecting || connected}
                style={{ flex: 2, opacity: (connecting || connected) ? 0.6 : 1 }}
              >
                {connected ? 'Connected' : connecting ? 'Connecting…' : '→ Connect'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* View full profile — chat context (read-only, no actions) */}
      {!onConnect && !onSkip && profileId && (
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'white', flexShrink: 0, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <Link
            href={`/profile/${profileId}`}
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '11px 0', borderRadius: 12,
              border: '1.5px solid var(--border)', fontSize: 14, fontWeight: 600,
              color: 'var(--text-soft)', background: 'var(--sur2)', textDecoration: 'none',
            }}
          >
            View full profile
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </>
  ) : null;

  return (
    <AnimatePresence>
      {profile && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[500] bg-black/60"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            key="drawer-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[501] bg-white rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>
            {panelBody}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
