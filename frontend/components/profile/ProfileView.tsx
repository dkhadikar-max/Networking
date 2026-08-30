/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/lib/types';
import { formatIntent } from '@/lib/intent';

function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch { return undefined; }
}

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
  user: User;
  isSelf?: boolean;
  connected?: boolean;
  connectionId?: string;
  onConnect?: () => Promise<void>;
  onBack?: () => void;
  onEdit?: () => void;
};

export default function ProfileView({ user, isSelf, connected, connectionId, onConnect, onBack, onEdit }: Props) {
  const router = useRouter();
  const { logout } = useAuth();
  // No fabricated identity fallbacks — an incomplete real profile must never
  // silently render as a fake person (see 2026-08-29 IA audit). Missing
  // fields hide their section instead of showing invented content.
  const name = user.name || 'Unknown';
  const headline = user.headline;
  const photos = user.photos && user.photos.length > 0 ? user.photos : [];

  const location = user.location;
  const working_on = user.working_on;
  const currently_exploring = user.currently_exploring;
  const bio = user.bio;

  const trust_score = user.trust_score;
  const verified = (user as { identity_verified?: boolean }).identity_verified ?? user.verified ?? false;
  const intent = user.intent;
  const intentText = intent ? formatIntent(intent) : null;

  const skills: string[] = user.skills ?? [];
  const interests: string[] = user.interests ?? [];
  // Only true when every narrative section would otherwise render nothing —
  // a profile with even one of these still gets its normal sections below.
  // Deliberately excludes headline/location/socials: those are supplementary,
  // their absence alone doesn't mean "this profile has no content."
  const hasNoContent = !working_on && !currently_exploring && !bio && skills.length === 0 && interests.length === 0;

  const socialLinks = [
    {
      label: 'LinkedIn',
      href: safeHref(user.linkedin),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      ),
    },
    {
      label: 'Website',
      href: safeHref(user.website),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.5 2.7 3.8 6 3.8 9.5s-1.3 6.8-3.8 9.5c-2.5-2.7-3.8-6-3.8-9.5s1.3-6.8 3.8-9.5z" /></svg>
      ),
    },
    {
      label: 'Instagram',
      href: safeHref(user.instagram ? `https://instagram.com/${user.instagram.replace(/^@/, '')}` : undefined),
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" /></svg>
      ),
    },
  ].filter((l): l is typeof l & { href: string } => !!l.href);

  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxError, setLightboxError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Per-image focal Y (0–100 %) derived from the loaded image's natural
  // aspect ratio. Portraits keep the head near the top of the crop;
  // landscape environmental shots recentre lower where the subject
  // typically sits. A future data-model change can override this per photo.
  const [heroFocalY, setHeroFocalY] = useState<number>(35);
  const photoFocalOverride = (user as User & { photo_focal_y?: number[] }).photo_focal_y?.[photoIdx];
  const heroObjectPosition = `center ${photoFocalOverride ?? heroFocalY}%`;

  function handleHeroImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    const ratio = w / h;
    // Portrait (< 0.9): head sits in the top third → anchor high
    // Square-ish (0.9–1.15): slight top bias so foreheads survive
    // Landscape (> 1.15): subject usually mid-to-lower → anchor low
    const y = ratio < 0.9 ? 22 : ratio < 1.15 ? 32 : 60;
    setHeroFocalY(y);
  }

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function triggerConnect() {
    if (connecting || !onConnect) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <main className="w-full min-h-screen bg-white text-left font-sans relative" data-full-profile="true" style={{ colorScheme: 'light', backgroundColor: '#ffffff', color: '#0F172A' }}>
      <article className="w-full">
        {/* --- 1. FIXED TOP NAV ------------------------------------------------- */}
        <header className="px-5 h-[56px] border-b border-slate-100 flex items-center justify-between bg-white/95 backdrop-blur-md sticky top-0 z-30 shrink-0">
          <button 
            onClick={onBack ? onBack : () => router.back()}
            className="w-9 h-9 -ml-1 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:scale-90 transition-all cursor-pointer rounded-full"
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          {/* Was a bare, unlinked icon — no accompanying wordmark (unlike
              Discover's header) and nothing to tap, so it just floated
              there with no explained purpose. Now a real "go home" control,
              matching the same logo-links-to-Discover pattern DesktopNav
              already uses. */}
          <Link
            href="/discover"
            aria-label="Build Your Network — go to Discover"
            className="flex items-center gap-2 hover:opacity-75 active:opacity-60 transition-opacity"
          >
            <img src="/assets/logo.png" alt="" className="h-6 w-auto object-contain block" />
          </Link>
          {/* Spacer matching the back button's footprint — keeps the logo
              centered now that Priority messaging has no entry point on
              Profile. Priority already lives on Chat (composing/inbox
              there is contextual to an actual conversation); Profile
              doesn't need its own separate entry point — see the
              2026-08-30 IA freeze. */}
          <div className="w-9 h-9" aria-hidden="true" />
        </header>

        {/* --- 2. REAL VERTICAL EDITORIAL PAGE (Tighter natural rhythm) --------------- */}
        <div className="w-full" style={{ paddingBottom: '96px' }}>
        
        {/* --- A. FULL-BLEED HERO PHOTO (420px tall) --- */}
        <section className="relative w-full overflow-hidden shrink-0" style={{ height: '420px', backgroundColor: '#F1F5F9' }}>
          {photos[photoIdx] && !lightboxError ? (
            <img
              src={getUncroppedImageUrl(photos[photoIdx])}
              alt={name}
              onLoad={handleHeroImgLoad}
              onError={() => setLightboxError(true)}
              className="w-full h-full object-cover select-none"
              style={{ objectPosition: heroObjectPosition }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
              <span className="text-6xl font-extrabold text-slate-400">{initials}</span>
            </div>
          )}

          {/* Tap Navigation for Story Photos — real buttons, not bare divs;
              see SwipeCard.tsx for why. */}
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
        </section>

        {/* -- B. IDENTITY & INTENT (Hero -> identity 16px, Identity -> BUILDING 36px) -- */}
        <section style={{ padding: '16px 20px 0 20px', marginBottom: '36px' }}>
          <div>
            <h1 className="text-[28px] font-extrabold text-slate-900 flex items-center gap-2 tracking-tight" style={{ lineHeight: 1.15 }}>
              <span>{name}</span>
              {verified && (
                <svg className="w-5.5 h-5.5 text-[#157A6E] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
            </h1>
            {headline && (
              <p className="text-[15px] font-semibold text-slate-700 mt-2" style={{ lineHeight: 1.35 }}>
                {headline}
              </p>
            )}
            {location && (
              <p className="text-[13px] text-slate-400 flex items-center gap-1.5 mt-2 font-medium">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{location}</span>
              </p>
            )}
          </div>

          {/* Badges: Trust Score + Intent (Subtle rectangular geometry) */}
          {(trust_score != null || intentText) && (
            <div className="flex flex-wrap items-center gap-2 pt-3.5">
              {trust_score != null && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200/70 text-[#157A6E] text-[12px] font-semibold">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  <span>Trust Score {trust_score}</span>
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

        {/* Nothing narrative to show — one quiet paragraph in the same
            editorial rhythm as the sections it stands in for, not a card
            or panel. Self gets guidance toward what to add; viewing someone
            else gets a neutral, non-judgmental note. Only renders when
            every one of Building/Looking For/About/Skills/Interests is
            genuinely absent.
            No inline "edit your profile" link here — the fixed Edit
            Profile button sits right below this on screen; a second link
            to the same action was pure redundancy, not real guidance. */}
        {hasNoContent && (
          <section style={{ margin: '36px 0', padding: '0 20px' }}>
            {isSelf ? (
              <p className="text-[15px] text-slate-400 font-normal leading-relaxed">
                Your profile doesn&apos;t have much here yet. Add what you&apos;re building, what you&apos;re looking for, and a few skills so people understand who they&apos;re connecting with.
              </p>
            ) : (
              <p className="text-[15px] text-slate-400 font-normal leading-relaxed">
                Nothing more to show here yet.
              </p>
            )}
          </section>
        )}

        {/* -- C. BUILDING (36px vertical margin, 12px heading gap) -- */}
        {working_on && (
          <section style={{ margin: '36px 0', padding: '0 20px' }}>
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              BUILDING
            </h2>
            <p className="text-[15px] text-slate-800 font-normal leading-relaxed">
              {working_on}
            </p>
          </section>
        )}

        {/* -- D. LOOKING FOR (36px vertical margin, 12px heading gap) -- */}
        {currently_exploring && (
          <section style={{ margin: '36px 0', padding: '0 20px' }}>
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              LOOKING FOR
            </h2>
            <p className="text-[15px] text-slate-800 font-normal leading-relaxed">
              {currently_exploring}
            </p>
          </section>
        )}

        {/* -- E. ABOUT & WHY CONNECT (36px vertical margin, 12px heading gap) -- */}
        {bio && (
          <section style={{ margin: '36px 0', padding: '0 20px' }}>
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              ABOUT & WHY CONNECT
            </h2>
            <p className="text-[15px] text-slate-700 font-normal leading-relaxed">
              {bio}
            </p>
          </section>
        )}

        {/* EXPERIENCE intentionally removed — there is no real data model
            backing work-history entries (no `experiences` field on User,
            no editor for it in ProfileEdit). The section previously here
            was two hardcoded fake jobs shown on every profile regardless
            of who was viewing it. Re-add only once real experience data
            exists (see 2026-08-29 IA audit, finding 2). */}

        {/* -- G. SKILLS (Understated tags subordinate to narrative) -- */}
        {skills.length > 0 && (
          <section style={{ margin: '32px 0', padding: '0 20px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              SKILLS
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {skills.map(s => (
                <span key={s} className="bg-slate-50 border border-slate-200/80 text-slate-700 text-[12px] px-2.5 py-1 rounded-md font-medium">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* -- H. INTERESTS (Understated tags subordinate to narrative) -- */}
        {interests.length > 0 && (
          <section style={{ margin: '32px 0', padding: '0 20px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              INTERESTS
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {interests.map(i => (
                <span key={i} className="bg-slate-50 border border-slate-200/80 text-slate-600 text-[12px] px-2.5 py-1 rounded-md font-medium">
                  {i}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* -- I. SOCIAL LINKS — real user.linkedin/website/instagram only.
               Previously three icons all pointed to href="#"; hidden
               entirely when the user hasn't added any. -- */}
        {socialLinks.length > 0 && (
          <section style={{ margin: '32px 0', padding: '0 20px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              SOCIAL LINKS
            </h2>
            <div className="flex items-center gap-3">
              {socialLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label}
                  className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-90 text-slate-700 flex items-center justify-center transition-all"
                >
                  {link.icon}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* -- ACCOUNT — self only. There was previously no way to sign out
               on mobile at all (DesktopNav has it, BottomNav never did),
               and no in-app link to Terms/Privacy/Contact outside the
               logged-out marketing footer. Scoped to this screen, no new
               route. -- */}
        {isSelf && (
          <section style={{ margin: '32px 0', padding: '0 20px', borderTop: '1px solid #F1F5F9', paddingTop: '28px' }}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
              ACCOUNT
            </h2>
            <div className="flex flex-col">
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 text-[14px] text-slate-600 hover:text-slate-900 active:opacity-60 transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 text-[14px] text-slate-600 hover:text-slate-900 active:opacity-60 transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 text-[14px] text-slate-600 hover:text-slate-900 active:opacity-60 transition-colors"
              >
                Contact
              </a>
              <button
                type="button"
                onClick={logout}
                className="py-2.5 text-[14px] text-left text-red-600 font-semibold hover:text-red-700 active:opacity-60 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </section>
        )}
      </div>
      </article>

      {/* -- 3. FLOATING ACTION CONTROLS --
             Self never sees Skip/Connect — those are Discovery's swipe
             decision, not a self-management action. Own profile gets Edit
             instead (previously `onEdit` was accepted but never rendered,
             leaving no way to reach ProfileEdit from this view). Someone
             else's profile keeps Skip/Connect as the final decision after
             reading the full document — not duplicated swipe controls. -- */}
      {isSelf ? (
        onEdit && (
          <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3.5 z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
            <button
              onClick={onEdit}
              className="w-full py-3 bg-[#157A6E] hover:bg-[#0D6E63] active:scale-[0.97] text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              <span>Edit Profile</span>
            </button>
          </div>
        )
      ) : (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3.5 flex items-center gap-3 z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <button
            onClick={onBack ? onBack : () => router.back()}
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
      )}

    </main>
  );
}
