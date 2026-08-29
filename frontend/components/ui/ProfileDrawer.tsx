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
      {/* Scrollable content with warm, aesthetic, premium light canvas */}
      <div data-profile-scroll className="flex-1 overflow-y-auto bg-white text-slate-900 selection:bg-teal-100 selection:text-teal-900">
        {/* Photo with overlaid controls & natural vignette */}
        <div className="relative bg-slate-100 shrink-0 h-64 sm:h-72 overflow-hidden">
          {photos[photoIdx] ? (
            <Image src={photos[photoIdx]} alt={name} fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-teal-50/60">
              <Avatar src={null} name={name} size={80} />
            </div>
          )}

          {/* Top subtle vignette for control legibility */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 via-black/25 to-transparent pointer-events-none" />

          {/* Close — top-left */}
          <button
            onClick={onClose}
            className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-black/40 hover:bg-black/65 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all cursor-pointer shadow-md"
            aria-label="Close"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Badges — top-right */}
          {(trustScore != null || score != null) && (
            <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
              {trustScore != null && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-md ${
                  trustScore >= 70
                    ? 'bg-white/95 text-[#157A6E] border-teal-200/90 shadow-2xs'
                    : 'bg-white/90 text-slate-600 border-slate-200'
                }`}>
                  {trustScore >= 70 ? '✓ Trusted' : `Trust ${trustScore}`}
                </span>
              )}
              {score != null && (
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-[#157A6E] to-[#1DB7A6] text-white text-xs font-extrabold shadow-sm">
                  {score}% match
                </span>
              )}
            </div>
          )}

          {/* Photo pagination dots */}
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIdx(i)}
                  className={`transition-all rounded-full cursor-pointer ${
                    i === photoIdx
                      ? 'w-5 h-1.5 bg-white shadow-sm'
                      : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
                  }`}
                  aria-label={`View photo ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content Container: Editorial, flowing, aesthetic vertical rhythm */}
        <div className="px-6 py-6 space-y-7 sm:space-y-8 pb-16">
          {/* 1. Identity: Prominent name + Role/Location */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {name}
              </h2>
              {raw?.verified && (
                <span title="Verified identity" className="inline-flex items-center text-[#157A6E]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
              )}
            </div>

            {(raw?.headline || raw?.location) && (
              <div className="text-sm sm:text-[15px] text-slate-600 font-medium leading-relaxed flex flex-col gap-0.5">
                {raw?.headline && <span className="text-slate-700">{raw.headline}</span>}
                {raw?.location && (
                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs sm:text-sm">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#157A6E]">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                    {raw.location}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 2. LOOKING FOR: Signature Aesthetic Hero Intent Card */}
          {raw?.intent && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-50/90 via-[#E6F7F4] to-cyan-50/80 p-4 sm:p-5 border border-teal-200/80 shadow-[0_4px_20px_-4px_rgba(21,122,110,0.12)]">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal-300/20 rounded-full blur-xl pointer-events-none" />
              <div className="flex items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-2xs border border-teal-200/60 flex items-center justify-center text-lg shrink-0">
                    🎯
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800/90">
                      Looking for
                    </div>
                    <div className="text-base sm:text-lg font-extrabold text-slate-900 truncate tracking-tight">
                      {formatIntent(raw.intent)}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#157A6E] text-white text-xs font-bold tracking-wider uppercase shrink-0 shadow-xs">
                  Active
                </span>
              </div>
            </div>
          )}

          {insight && (
            <div className="px-4 py-2.5 bg-teal-50/80 rounded-xl text-xs sm:text-sm text-[#157A6E] font-medium border border-teal-200/60 flex items-center gap-2.5 shadow-2xs">
              <span className="text-teal-600 text-sm">✦</span>
              <span>{insight}</span>
            </div>
          )}

          {/* 3. WORKING ON: Clean Editorial Typographic Section */}
          {raw?.working_on && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>🚀</span>
                <span>Working on</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {raw.working_on}
              </p>
            </div>
          )}

          {/* 4. ABOUT: Full, comfortable readable narrative */}
          {raw?.bio && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">About</p>
              <p className="text-[15px] sm:text-base text-slate-700 leading-[1.7] font-normal">
                {raw.bio}
              </p>
            </div>
          )}

          {/* 5. EXPLORING: Dedicated editorial section */}
          {raw?.currently_exploring && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Exploring</p>
              <p className="text-[15px] sm:text-base text-slate-700 leading-relaxed font-normal">
                {raw.currently_exploring}
              </p>
            </div>
          )}

          {/* 6. INTERESTS: Crisp luxury teal chips */}
          {(raw?.interests?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Interests</p>
              <div className="flex flex-wrap gap-2">
                {raw!.interests!.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-sm font-medium bg-teal-50/90 text-teal-950 border border-teal-200/80 hover:bg-teal-100/90 transition-all shadow-2xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 7. SKILLS: Warm champagne amber chips */}
          {(raw?.skills?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-800/80">Skills</p>
              <div className="flex flex-wrap gap-2">
                {raw!.skills!.map(s => (
                  <span
                    key={s}
                    className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-sm font-semibold bg-[#FFF4E7] text-[#92400E] border border-[#F4A259]/50 shadow-2xs"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 8. SOCIAL LINKS: Elegant styled squircle buttons */}
          {(safeHref(raw?.linkedin) || safeHref(raw?.website) || raw?.instagram) && (
            <div className="pt-2 flex items-center gap-3">
              {safeHref(raw?.linkedin) && (
                <a
                  href={safeHref(raw?.linkedin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-teal-50 border border-slate-200/90 hover:border-teal-300 text-slate-600 hover:text-[#157A6E] flex items-center justify-center transition-all shadow-2xs"
                  aria-label="LinkedIn profile"
                  title="LinkedIn"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" /><circle cx="4" cy="4" r="2" />
                  </svg>
                </a>
              )}
              {safeHref(raw?.website) && (
                <a
                  href={safeHref(raw?.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-teal-50 border border-slate-200/90 hover:border-teal-300 text-slate-600 hover:text-[#157A6E] flex items-center justify-center transition-all shadow-2xs"
                  aria-label="Website"
                  title="Website"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </a>
              )}
              {raw?.instagram && (
                <a
                  href={`https://instagram.com/${raw.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-teal-50 border border-slate-200/90 hover:border-teal-300 text-slate-600 hover:text-[#157A6E] flex items-center justify-center transition-all shadow-2xs"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action bar */}
      {(onConnect || onSkip) && (
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white/95 backdrop-blur-2xl shrink-0 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 max-w-full">
            {onSkip && (
              <button
                type="button"
                className="h-12 px-5 rounded-2xl bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200 text-slate-600 hover:text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                onClick={onSkip}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                Skip
              </button>
            )}
            {onConnect && (
              <button
                type="button"
                className="flex-1 h-12 px-6 rounded-2xl bg-gradient-to-r from-[#157A6E] via-[#126B60] to-[#157A6E] hover:from-[#126B60] hover:to-[#0E5E55] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(21,122,110,0.25)] hover:shadow-[0_6px_20px_rgba(21,122,110,0.35)] transition-all cursor-pointer disabled:opacity-50"
                onClick={handleConnect}
                disabled={connecting || connected}
              >
                {connected ? 'Connected' : connecting ? 'Connecting…' : '→ Connect'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* View full profile — chat / read-only context */}
      {!onConnect && !onSkip && profileId && (
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-white/95 backdrop-blur-2xl shrink-0 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <Link
            href={`/profile/${profileId}`}
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-slate-50 hover:bg-teal-50/70 border border-slate-200 hover:border-teal-300 text-slate-700 hover:text-[#157A6E] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all no-underline shadow-2xs"
          >
            <span>View full profile</span>
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
            className="fixed inset-0 z-[500] bg-black/55 backdrop-blur-xs"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            key="drawer-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[501] bg-white rounded-t-[32px] max-h-[92vh] flex flex-col overflow-hidden shadow-[0_-12px_40px_rgba(0,0,0,0.12)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:rounded-3xl sm:max-h-[85vh] sm:border sm:border-slate-200/80 sm:shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0 bg-white">
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            {panelBody}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
