/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import type { DiscoverProfile, User } from '@/lib/types';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import { formatIntent } from '@/lib/intent';

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

export default function SwipeCard({ profile, onConnect, onSkip }: Props) {
  const user = (profile?.user ?? profile ?? {}) as User;
  const name = user?.name ?? 'Aarav Sharma';
  const photos = user?.photos && user.photos.length > 0 ? user.photos : ['/assets/sample-founder-1.jpg', '/assets/sample-founder-2.jpg'];
  const headline = user?.headline ?? 'Founder & CEO @ NeuroFlow · Bengaluru';
  const location = user?.location ?? 'Bengaluru, India';
  
  const working_on = user?.working_on || 
    'Autonomous energy grid optimization network built with edge AI models. Deploying decentralized real-time inference nodes to dynamically balance municipal power distribution across regional smart grids.';
  
  const currently_exploring = user?.currently_exploring || 
    'A world-class Principal Frontend Engineer & Design Partner obsessed with high-framerate data visualizations, WebGL telemetry dashboards, and reactive system architecture.';
  
  const bio = user?.bio || 
    'Serial builder and systems architect passionate about edge computing, real-time grid orchestration, and high-framerate interfaces. Previously scaled streaming pipelines at Gridlytics handling 40M+ daily events. Looking for someone with deep frontend taste to build our core interface from zero to one.';

  const trust_score = user?.trust_score ?? 95;
  const verified = (user as { identity_verified?: boolean })?.identity_verified ?? user?.verified ?? true;
  const intent = user?.intent ?? 'find-cofounder';
  const intentText = intent ? formatIntent(intent) : 'Co-founder';

  const skills: string[] = user?.skills && user.skills.length > 0
    ? user.skills
    : ['Distributed Systems', 'PyTorch', 'Next.js', 'System Architecture', 'Edge AI Models', 'TypeScript', 'WebGL'];

  const interests: string[] = user?.interests && user.interests.length > 0
    ? user.interests
    : ['Autonomous AI', 'Climate Tech', 'Distributed Systems', 'High-Framerate UX', 'Clean Energy'];

  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxError, setLightboxError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showPriority, setShowPriority] = useState(false);

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function triggerConnect() {
    if (connecting) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <div className="w-full bg-white text-left font-sans relative">
      
      {/* --- REAL VERTICAL FEED DOCUMENT (Tighter natural rhythm) --- */}
      <main className="w-full" style={{ paddingBottom: '96px' }}>
        
        {/* --- A. FULL-BLEED HERO PHOTO (420px tall) --- */}
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

          {/* Tap Navigation for Story Photos */}
          {photos.length > 1 && (
            <>
              <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.max(0, i - 1)); }} className="absolute left-0 top-0 w-1/2 h-full z-10 cursor-pointer" />
              <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.min(photos.length - 1, i + 1)); }} className="absolute right-0 top-0 w-1/2 h-full z-10 cursor-pointer" />
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
          <div className="flex flex-wrap items-center gap-2 pt-3.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200/70 text-[#157A6E] text-[12px] font-semibold">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Trust Score {trust_score}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50/90 border border-orange-200/70 text-[#E65100] text-[12px] font-semibold">
              <span>🎯</span>
              <span>Looking for: {intentText}</span>
            </div>
          </div>
        </section>

        {/* -- C. BUILDING (36px vertical margin, 12px heading gap) -- */}
        <section style={{ margin: '36px 0', padding: '0 20px' }}>
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
            BUILDING
          </h2>
          <p className="text-[15px] text-slate-800 font-normal leading-relaxed">
            {working_on}
          </p>
        </section>

        {/* -- D. LOOKING FOR (36px vertical margin, 12px heading gap) -- */}
        <section style={{ margin: '36px 0', padding: '0 20px' }}>
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
            LOOKING FOR
          </h2>
          <p className="text-[15px] text-slate-800 font-normal leading-relaxed">
            {currently_exploring}
          </p>
        </section>

        {/* -- E. ABOUT & WHY CONNECT (36px vertical margin, 12px heading gap) -- */}
        <section style={{ margin: '36px 0', padding: '0 20px' }}>
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
            ABOUT & WHY CONNECT
          </h2>
          <p className="text-[15px] text-slate-700 font-normal leading-relaxed">
            {bio}
          </p>
        </section>

        {/* -- F. EXPERIENCE (36px vertical margin, 20px entry gap) -- */}
        <section style={{ margin: '36px 0', padding: '0 20px' }}>
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#157A6E] mb-3.5">
            EXPERIENCE
          </h2>
          <div className="space-y-5 text-left">
            <div>
              <p className="text-[16px] font-bold text-slate-900">Founder & CEO · NeuroFlow</p>
              <p className="text-[12px] text-slate-400 font-medium mt-0.5">Aug 2023 – Present · 2 yrs 7 mos · Bengaluru</p>
              <p className="text-[14px] text-slate-600 mt-2 leading-relaxed">
                Leading engineering and research on autonomous edge-grid optimization networks and decentralized real-time inference nodes.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <p className="text-[16px] font-bold text-slate-800">ML Engineer @ Gridlytics</p>
              <p className="text-[12px] text-slate-400 font-medium mt-0.5">2021 – 2023 · 2 yrs · San Francisco / Remote</p>
              <p className="text-[14px] text-slate-600 mt-2 leading-relaxed">
                Built high-throughput distributed pipeline infrastructure for smart meter telemetry and predictive energy load balancing.
              </p>
            </div>
          </div>
        </section>

        {/* -- G. SKILLS (Understated tags subordinate to narrative) -- */}
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

        {/* -- H. INTERESTS (Understated tags subordinate to narrative) -- */}
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

        {/* -- I. SOCIAL LINKS (32px vertical margin) -- */}
        <section style={{ margin: '32px 0', padding: '0 20px' }}>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">
            SOCIAL LINKS
          </h2>
          <div className="flex items-center gap-3">
            <a href="#" className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
            <a href="#" className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="#" className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
          </div>
        </section>
      </main>

      {/* -- 3. FLOATING ACTION CONTROLS (Crisp rectangular rounded-lg buttons) - */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-100 px-6 py-3.5 flex items-center gap-3 z-30 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border border-slate-200 bg-white rounded-lg font-semibold text-slate-700 text-sm hover:bg-slate-50 transition-colors cursor-pointer text-center"
        >
          Skip
        </button>
        <button
          onClick={triggerConnect}
          disabled={connecting}
          className="flex-1 py-3 bg-[#157A6E] hover:bg-[#0D6E63] text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Connect</span>
        </button>
      </div>

      <PriorityMessageModal
        open={showPriority}
        onClose={() => setShowPriority(false)}
        mode="compose"
        targetId={user?.id ?? ''}
        targetName={name}
      />
    </div>
  );
}
