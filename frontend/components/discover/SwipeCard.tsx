/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import type { DiscoverProfile, User } from '@/lib/types';
import { formatIntent } from '@/lib/intent';

// Distance (px) or velocity (px/s) past which a drag release commits to
// Skip/Connect instead of springing back — standard Tinder-style card
// thresholds. Below either, the card just snaps back to center.
const SWIPE_DISTANCE_THRESHOLD = 100;
const SWIPE_VELOCITY_THRESHOLD = 500;

function getUncroppedImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.includes('res.cloudinary.com')) {
    return url.replace(/\/image\/upload\/.*?\/(v\d+\/)/, '/image/upload/q_auto,f_auto/$1');
  }
  if (url.includes('images.unsplash.com')) {
    return url.replace(/&fit=crop/g, '&fit=max');
  }
  return url;
}

type Props = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
  onInspect?: () => void;
};

/**
 * Discovery's fast decision surface — NOT a profile page.
 *
 * Shows just enough to decide "I want to know more" in ~5-10s: photo,
 * identity, intent, a short Building/Looking-for preview, and why they
 * matched. Tapping the identity row opens the Quick Peek
 * (components/profile/ProfileQuickPeek.tsx) for the next level of detail;
 * the full editorial document lives at /profile/[id]
 * (components/profile/ProfileView.tsx).
 *
 * Do not grow this component back into a full profile — About, Experience,
 * full Skills/Interests, and Social Links belong on Profile only. See the
 * 2026-08-29 Profile↔Discovery IA audit for why this file was trimmed.
 */
export default function SwipeCard({ profile, onConnect, onSkip, onInspect }: Props) {
  const user = (profile?.user ?? profile ?? {}) as User;
  const name = user?.name || 'Someone';
  const photos = user?.photos && user.photos.length > 0 ? user.photos : [];
  const headline = user?.headline;
  const location = user?.location;

  const working_on = user?.working_on;
  const currently_exploring = user?.currently_exploring;

  const trustScore = user?.trust_score ?? profile?.trust_score;
  const verified = (user as { identity_verified?: boolean })?.identity_verified ?? user?.verified ?? false;
  const intent = user?.intent;
  const intentText = intent ? formatIntent(intent) : null;

  const matchReasons: string[] = profile?.matchReasons ?? (profile?.insight ? [profile.insight] : []);

  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxError, setLightboxError] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function triggerConnect() {
    if (connecting) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  // Drag-to-swipe — this component's own name promised this gesture and it
  // never actually existed: Skip/Connect were tap-button-only, so a real
  // swipe on mobile did nothing. drag="x" on the card root; framer-motion
  // automatically sets touch-action so vertical touch scrolling inside the
  // card's own overflow-y-auto content area (Building/Looking For text)
  // keeps working natively alongside the horizontal drag — same reasoning
  // as the photo-nav buttons and Skip/Connect buttons nested inside this
  // draggable root: a tap with no meaningful pointer movement still reaches
  // its own onClick, only a real horizontal drag is captured here.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-14, 14]);
  const connectStampOpacity = useTransform(x, [20, SWIPE_DISTANCE_THRESHOLD], [0, 1]);
  const skipStampOpacity = useTransform(x, [-SWIPE_DISTANCE_THRESHOLD, -20], [1, 0]);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    const pastDistance = Math.abs(info.offset.x) > SWIPE_DISTANCE_THRESHOLD;
    const pastVelocity = Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (info.offset.x > 0 && (pastDistance || pastVelocity)) {
      triggerConnect();
    } else if (info.offset.x < 0 && (pastDistance || pastVelocity)) {
      onSkip();
    }
    // Spring back regardless of outcome — the parent replaces this card via
    // a new `current` profile (and thus a fresh `key`) once Skip/Connect
    // resolves, so this only matters for the released-but-under-threshold
    // case where the same card stays mounted.
    x.set(0);
  }

  return (
    // h-full bounds the card to .card-stack-area's box (the app shell
    // reserves the space below it for the persistent bottom nav — see
    // .card-stack-area / .bottom-nav in app.css, and globals.css for the
    // html/body height fix that makes this box actually bounded).
    //
    // flex-col + flex-1 overflow-y-auto (content) + a normal-flow footer
    // sibling — NOT position:absolute on the footer. An earlier version
    // put the scrollable content and an `absolute bottom-0` footer inside
    // the SAME overflow-y-auto element; measured live, that footer moved
    // WITH scroll instead of staying pinned (its containing block was the
    // scroll container itself), so on any candidate with enough Building/
    // Looking For text to actually scroll, Skip/Connect ended up sitting
    // on top of mid-scroll paragraph text instead of clear of it. This is
    // the same flex sandwich ChatWindow's header/message-canvas/composer
    // already use correctly — the scrollable region and the fixed footer
    // are siblings, never sharing one scrolling box.
    <motion.div
      className="w-full h-full bg-white text-left font-sans flex flex-col relative"
      style={{ x, rotate }}
      drag="x"
      dragElastic={0.6}
      onDragEnd={handleDragEnd}
    >
      {/* Swipe-direction stamps — only visible mid-drag (opacity driven by
          x), pointer-events-none so they never intercept the gesture or a
          tap underneath. */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: connectStampOpacity }}
        className="absolute top-8 left-6 z-40 pointer-events-none -rotate-12 border-[3px] border-[#157A6E] text-[#157A6E] text-xl font-extrabold px-3 py-1 rounded-lg bg-white/90 tracking-wide"
      >
        CONNECT
      </motion.div>
      <motion.div
        aria-hidden="true"
        style={{ opacity: skipStampOpacity }}
        className="absolute top-8 right-6 z-40 pointer-events-none rotate-12 border-[3px] border-slate-400 text-slate-500 text-xl font-extrabold px-3 py-1 rounded-lg bg-white/90 tracking-wide"
      >
        SKIP
      </motion.div>

      <div className="w-full flex-1 overflow-y-auto">

        {/* --- HERO PHOTO (420px tall) --- */}
        <section className="relative w-full overflow-hidden shrink-0" style={{ height: '420px', backgroundColor: '#F1F5F9' }}>
          {photos[photoIdx] && !lightboxError ? (
            <img
              src={getUncroppedImageUrl(photos[photoIdx])}
              alt={name}
              onError={() => setLightboxError(true)}
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
              <span className="text-6xl font-extrabold text-slate-400">{initials}</span>
            </div>
          )}

          {/* Tap Navigation for Story Photos — real buttons, not bare divs:
              this is the only way to see a candidate's other photos, so
              keyboard/screen-reader users need a real, labeled, reachable
              control here, not a mouse-only hit zone. */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.max(0, i - 1)); }}
                aria-label={`Previous photo (${photoIdx + 1} of ${photos.length})`}
                disabled={photoIdx === 0}
                className="absolute left-0 top-0 w-1/2 h-full z-10 cursor-pointer border-0 bg-transparent p-0 m-0 disabled:cursor-default"
              />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.min(photos.length - 1, i + 1)); }}
                aria-label={`Next photo (${photoIdx + 1} of ${photos.length})`}
                disabled={photoIdx === photos.length - 1}
                className="absolute right-0 top-0 w-1/2 h-full z-10 cursor-pointer border-0 bg-transparent p-0 m-0 disabled:cursor-default"
              />
            </>
          )}

          {/* Story Progress Bars */}
          {photos.length > 1 && (
            <div className="absolute top-4 inset-x-5 flex gap-1.5 z-20">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1 rounded-sm transition-all bg-white shadow-xs"
                  style={{ opacity: i === photoIdx ? 1 : 0.4 }}
                />
              ))}
            </div>
          )}

          <div className="absolute top-4 right-5 z-20">
            <span className="text-xs font-bold text-[#E65100] bg-[#FFF0EB]/95 backdrop-blur-md border border-[#FFCCBC] px-2.5 py-1 rounded-lg shadow-xs">
              ⚡ Priority
            </span>
          </div>
        </section>

        {/* --- IDENTITY — tap opens Quick Peek, not the full profile --- */}
        <section style={{ padding: '16px 20px 0 20px' }}>
          <button
            type="button"
            onClick={onInspect}
            className="card-identity-tap"
            aria-label={`View more about ${name}`}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="text-[26px] font-extrabold text-slate-900 flex items-center gap-2 tracking-tight" style={{ lineHeight: 1.15 }}>
                <span className="truncate">{name}</span>
                {verified && (
                  <svg className="w-5.5 h-5.5 text-[#157A6E] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                )}
              </h1>
              {headline && (
                <p className="text-[15px] font-semibold text-slate-700 mt-2 truncate" style={{ lineHeight: 1.35 }}>
                  {headline}
                </p>
              )}
              {location && (
                <p className="text-[13px] text-slate-400 flex items-center gap-1.5 mt-2 font-medium">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate">{location}</span>
                </p>
              )}
            </div>
            <svg className="card-identity-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          {(trustScore != null || intentText) && (
            <div className="flex flex-wrap items-center gap-2 pt-3.5">
              {trustScore != null && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200/70 text-[#157A6E] text-[12px] font-semibold">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>Trust Score {trustScore}</span>
                </div>
              )}
              {intentText && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFF0EB] border border-[#FFCCBC] text-[#E65100] text-[12px] font-semibold">
                  <span>🎯</span>
                  <span>Looking for: {intentText}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* --- DIRECT MATCH — why this person, when the API supplies it --- */}
        {matchReasons.length > 0 && (
          <section style={{ margin: '20px 0 0', padding: '0 20px' }}>
            <div className="rounded-xl border border-[#157A6E]/15 bg-gradient-to-br from-teal-50 to-emerald-50 px-3.5 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#157A6E] mb-1">💡 Direct Match</p>
              {matchReasons.map((r, i) => (
                <p key={i} className="text-[13px] text-slate-800 leading-relaxed">{r}</p>
              ))}
            </div>
          </section>
        )}

        {/* --- BUILDING — short preview, not the full paragraph --- */}
        {working_on && (
          <section style={{ margin: '20px 0 0', padding: '0 20px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-1.5">
              Building
            </h2>
            <p
              className="text-[14px] text-slate-700 font-normal leading-relaxed"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {working_on}
            </p>
          </section>
        )}

        {/* --- LOOKING FOR — short preview --- */}
        {currently_exploring && (
          <section style={{ margin: '16px 0 0', padding: '0 20px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-1.5">
              Looking For
            </h2>
            <p
              className="text-[14px] text-slate-700 font-normal leading-relaxed"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {currently_exploring}
            </p>
          </section>
        )}
      </div>

      {/* --- FLOATING ACTION CONTROLS — the final decision, not narrative content --- */}
      <div className="shrink-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3.5 flex items-center gap-3 z-30 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border border-slate-200 bg-white rounded-lg font-semibold text-slate-700 text-sm hover:bg-slate-50 active:scale-[0.97] transition-all cursor-pointer text-center"
        >
          Skip
        </button>
        <button
          onClick={triggerConnect}
          disabled={connecting}
          className="flex-1 py-3 bg-[#157A6E] hover:bg-[#0D6E63] active:scale-[0.97] text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Connect</span>
        </button>
      </div>
    </motion.div>
  );
}
