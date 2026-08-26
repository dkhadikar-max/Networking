/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import type { DiscoverProfile } from '@/lib/types';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import { formatIntent } from '@/lib/intent';

type Props = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
  onInspect?: () => void;
};

export default function SwipeCard({ profile, onConnect, onSkip, onInspect }: Props) {
  const user = profile.user ?? profile;
  const name = (user as { name?: string }).name ?? 'Unknown';
  const photos: string[] = (user as { photos?: string[] }).photos ?? [];
  const headline = (user as { headline?: string }).headline ?? '';
  const location = (user as { location?: string }).location ?? '';
  const bio = (user as { bio?: string }).bio ?? '';
  const intents: string[] = (user as { intent?: string }).intent ? [formatIntent((user as { intent: string }).intent)] : [];
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];
  const skills: string[] = (user as { skills?: string[] }).skills ?? [];
  const working_on = (user as { working_on?: string }).working_on ?? '';
  const currently_exploring = (user as { currently_exploring?: string }).currently_exploring ?? '';
  const score = profile.match_score ?? profile.matchScore;
  const trust_score = (profile as { trust_score?: number }).trust_score ?? (user as { trust_score?: number }).trust_score;
  const connected = !!profile.connection;
  const verified = (user as { identity_verified?: boolean }).identity_verified ?? (user as { verified?: boolean }).verified;

  const uid = (user as { id?: string }).id ?? (profile as { id?: string }).id ?? '';

  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const connectLabelRef = useRef<HTMLDivElement>(null);
  const skipLabelRef = useRef<HTMLDivElement>(null);
  const dragXRef = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function triggerConnect() {
    if (connected || connecting) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  async function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    await triggerConnect();
  }

  function handleSkip(e: React.MouseEvent) {
    e.stopPropagation();
    onSkip();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.sqrt(dx * dx + dy * dy) < 8) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      dragXRef.current = dx;
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
        cardRef.current.style.transition = 'none';
      }
      if (connectLabelRef.current) connectLabelRef.current.style.opacity = dx > 20 ? String(Math.min((dx - 20) / 60, 1)) : '0';
      if (skipLabelRef.current) skipLabelRef.current.style.opacity = dx < -20 ? String(Math.min((-dx - 20) / 60, 1)) : '0';
    }
  }

  async function handleTouchEnd() {
    const dx = dragXRef.current;
    dragXRef.current = 0;
    touchStartX.current = null;
    touchStartY.current = null;
    if (connectLabelRef.current) connectLabelRef.current.style.opacity = '0';
    if (skipLabelRef.current) skipLabelRef.current.style.opacity = '0';
    if (Math.abs(dx) >= 80) {
      const flyX = dx > 0 ? window.innerWidth * 1.4 : -window.innerWidth * 1.4;
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.28s ease-in';
        cardRef.current.style.transform = `translateX(${flyX}px) rotate(${dx > 0 ? 25 : -25}deg)`;
      }
      await new Promise<void>(r => setTimeout(r, 260));
      if (!mountedRef.current) return;
      if (dx > 0) await triggerConnect();
      else onSkip();
    } else {
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
        cardRef.current.style.transform = '';
      }
    }
  }

  // Pick the single most meaningful prompt to highlight cleanly without text clutter
  const primaryPrompt = working_on
    ? { icon: '🚀', title: 'Currently Building', content: working_on }
    : currently_exploring
    ? { icon: '🤝', title: 'Looking For', content: currently_exploring }
    : bio
    ? { icon: '⚡', title: 'About & Superpower', content: bio }
    : null;

  // Secondary prompt (if user has both building AND looking for)
  const secondaryPrompt = (working_on && currently_exploring)
    ? { icon: '🤝', title: 'Looking For', content: currently_exploring }
    : null;

  const displaySkills = skills.slice(0, 4);

  const [imgError, setImgError] = useState(false);

  // Reset img error on index change
  useEffect(() => { setImgError(false); }, [photoIdx]);

  return (
    <div
      ref={cardRef}
      className="swipe-card fullpage-swipe-card"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative' }}
    >
      {/* Dynamic Drag Gestural Labels */}
      <div
        ref={connectLabelRef}
        aria-hidden="true"
        style={{
          position: 'absolute', top: 20, left: 20, zIndex: 40,
          background: 'rgba(21,184,166,0.95)', color: 'white',
          padding: '8px 18px', borderRadius: 12, fontWeight: 900,
          fontSize: 14, border: '2.5px solid rgba(255,255,255,0.7)',
          opacity: 0, pointerEvents: 'none',
          boxShadow: '0 12px 30px rgba(21,184,166,0.4)',
        }}
      >
        CONNECT ✓
      </div>
      <div
        ref={skipLabelRef}
        aria-hidden="true"
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 40,
          background: 'rgba(239,68,68,0.95)', color: 'white',
          padding: '8px 18px', borderRadius: 12, fontWeight: 900,
          fontSize: 14, border: '2.5px solid rgba(255,255,255,0.7)',
          opacity: 0, pointerEvents: 'none',
          boxShadow: '0 12px 30px rgba(239,68,68,0.4)',
        }}
      >
        SKIP ✗
      </div>

      {/* ── 1. FULL-BLEED HERO PHOTO / AVATAR WITH IMMERSIVE OVERLAY ── */}
      <div className="relative w-full aspect-[4/3.6] sm:aspect-[4/4.2] max-h-[320px] sm:max-h-[420px] shrink-0 overflow-hidden bg-gradient-to-br from-[#0F2826] via-[#157A6E] to-[#0A1A18]">
        {photos.length > 0 && photos[photoIdx] && !imgError ? (
          <img
            src={photos[photoIdx]}
            alt={name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/90 bg-gradient-to-br from-[#157A6E] via-[#0E5E55] to-[#083D37]">
            <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center font-extrabold text-3xl sm:text-4xl border border-white/20 shadow-2xl mb-2">
              {initials}
            </div>
            <span className="text-[11px] sm:text-xs uppercase font-bold tracking-widest text-teal-200/80">
              Verified Builder Profile
            </span>
          </div>
        )}

        {/* Multi-Photo Story Bars */}
        {photos.length > 1 && (
          <div className="absolute top-2.5 inset-x-3.5 flex gap-1.5 z-20">
            {photos.map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-all"
                style={{
                  background: i === photoIdx ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                  boxShadow: i === photoIdx ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                }}
              />
            ))}
          </div>
        )}

        {/* Story Tap Navigation */}
        {photos.length > 1 && (
          <>
            <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.max(0, i - 1)); }} className="absolute left-0 top-0 w-1/2 h-2/3 z-10 cursor-pointer" />
            <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.min(photos.length - 1, i + 1)); }} className="absolute right-0 top-0 w-1/2 h-2/3 z-10 cursor-pointer" />
          </>
        )}

        {/* Top Frosted Intent & Match Pill Bar (Positioned below story bars if present) */}
        <div className={`absolute ${photos.length > 1 ? 'top-6' : 'top-3.5'} inset-x-3.5 flex items-center justify-between pointer-events-none z-20`}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/20 text-white text-[11px] font-extrabold tracking-wide uppercase shadow-lg">
            <span>🎯</span> {intents[0] || 'Open to Connect'}
          </span>
          {score != null && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#157A6E]/80 backdrop-blur-md border border-teal-300/40 text-white text-[11px] font-extrabold tracking-wider tabular-nums shadow-lg">
              {score}% MATCH
            </span>
          )}
        </div>

        {/* Deep Gradient Scrim Overlay at Bottom of Photo */}
        <div className="absolute inset-x-0 bottom-0 h-32 sm:h-40 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent pointer-events-none" />

        {/* Overlaid Identity Info */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 z-20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-white tracking-tight drop-shadow-md truncate">
                  {name}
                </h2>
                {verified && (
                  <span
                    className="w-5 h-5 rounded-full bg-[#157A6E] text-white flex items-center justify-center text-[10px] font-extrabold shadow-md border border-white/80 shrink-0"
                    title="Verified Identity"
                  >
                    ✓
                  </span>
                )}
                {trust_score != null && (
                  <span className="text-[10px] font-bold text-teal-200 bg-white/15 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20 tabular-nums shrink-0">
                    Trust {trust_score}
                  </span>
                )}
              </div>
              {(headline || location) && (
                <p className="text-xs sm:text-sm text-slate-200 font-medium truncate mt-1 drop-shadow-sm">
                  {headline}{headline && location ? ' · ' : ''}{location}
                </p>
              )}
            </div>

            {onInspect && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onInspect(); }}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white hover:bg-white/30 flex items-center justify-center transition-all cursor-pointer shrink-0"
                aria-label={`View ${name}'s full profile`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. SPACIOUS, UNCLUTTERED SUBSTANCE SECTION ── */}
      <div className="p-5 sm:p-6 space-y-4 bg-white flex-1 overflow-y-auto">

        {/* Primary Punchy Prompt Card */}
        {primaryPrompt && (
          <div className="p-4 sm:p-4.5 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{primaryPrompt.icon}</span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {primaryPrompt.title}
              </span>
            </div>
            <p className="text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">
              {primaryPrompt.content}
            </p>
          </div>
        )}

        {/* Secondary Prompt Card (only if applicable, never overcrowded) */}
        {secondaryPrompt && (
          <div className="p-4 rounded-2xl bg-[#FFF4E7]/60 border border-[#F4A259]/30 shadow-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">{secondaryPrompt.icon}</span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#92400E]">
                {secondaryPrompt.title}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 leading-relaxed">
              {secondaryPrompt.content}
            </p>
          </div>
        )}

        {/* Key Skill Pills (Airy, Comfortable padding) */}
        {displaySkills.length > 0 && (
          <div className="pt-1">
            <div className="flex flex-wrap gap-2">
              {displaySkills.map(s => (
                <span
                  key={s}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#F8FAFC] text-slate-700 border border-slate-200/90 shadow-2xs"
                >
                  {s}
                </span>
              ))}
              {interests.slice(0, 2).map(t => (
                <span
                  key={t}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#FFF4E7] text-[#92400E] border border-[#F4A259]/30"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. FLOATING BUMBLE BIZZ 3-BUTTON ACTION BAR ── */}
      <div className="p-4 sm:p-5 bg-white/95 backdrop-blur-md border-t border-slate-100 sticky bottom-0 z-30 shrink-0 flex items-center justify-center gap-3">
        {/* ✕ Skip */}
        <button
          className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 active:scale-95 shadow-sm flex items-center justify-center transition-all cursor-pointer shrink-0"
          onClick={handleSkip}
          aria-label="Skip profile"
          title="Skip"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* 📝 Add a Note / Icebreaker */}
        {uid ? (
          <button
            className="flex-1 max-w-[160px] h-14 px-4 rounded-2xl bg-white border border-[#F4A259]/60 text-[#92400E] hover:bg-[#FFF4E7] active:scale-98 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
            onClick={e => { e.stopPropagation(); setShowPriority(true); }}
            title="Send an icebreaker note with your connection"
          >
            <span className="text-base">📝</span>
            <span>Add a Note</span>
          </button>
        ) : null}

        {/* ⚡ Primary Connect */}
        <button
          className="flex-1 h-14 px-6 rounded-2xl bg-gradient-to-r from-[#157A6E] via-[#0E5E55] to-[#1DB7A6] text-white font-extrabold text-sm sm:text-base tracking-wide shadow-lg shadow-[#157A6E]/30 hover:shadow-[#157A6E]/40 hover:opacity-98 active:scale-98 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleConnect}
          disabled={connected || connecting}
        >
          {connecting ? (
            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{connected ? 'Requested' : 'Connect'}</span>
            </>
          )}
        </button>
      </div>

      <PriorityMessageModal
        open={showPriority}
        onClose={() => setShowPriority(false)}
        mode="compose"
        targetId={uid}
        targetName={name}
      />
    </div>
  );
}
