'use client';

import { User } from '@/lib/types';

type Props = {
  user: User;
  onViewFull: () => void;
};

export default function ProfileQuickPeek({ user, onViewFull }: Props) {
  const name = user.name ?? 'Aarav Sharma';
  const headline = user.headline ?? 'Founder & CEO @ NeuroFlow · Bengaluru';
  const location = user.location ?? 'Bengaluru, India';
  const working_on = user.working_on ?? 'Autonomous energy grid optimization network built with edge AI models.';
  const currently_exploring = user.currently_exploring ?? 'World-class Principal Frontend Engineer & Design Partner.';
  const bio = user.bio ?? 'Serial builder, previously built scalable data pipelines. Looking for someone obsessed with high-framerate UX to build our core interface.';
  const interests = user.interests && user.interests.length > 0 ? user.interests : ['Autonomous AI', 'Climate Tech', 'Distributed Systems'];

  return (
    <div className="flex flex-col h-full bg-white text-left overflow-hidden">
      {/* -- 1. SCROLLABLE CONTEXT BODY -- */}
      <div className="flex-1 overflow-y-auto px-6 pt-1 pb-4 space-y-4 no-scrollbar">
        {/* Identity Header */}
        <div className="flex flex-col gap-1 shrink-0 pb-1 border-b border-slate-100">
          <h2 className="font-bold text-xl sm:text-2xl text-slate-900 flex items-center gap-1.5 leading-tight">
            <span>{name}</span>
            {user.verified && (
              <svg className="w-4.5 h-4.5 text-[#157A6E] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
          </h2>
          {headline && <p className="text-sm font-medium text-slate-600 mt-0.5">{headline}</p>}
          {location && (
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 font-medium">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{location}</span>
            </p>
          )}
        </div>

        {/* Building Row */}
        <div className="flex items-start gap-3.5 pt-1">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#FF7043] flex items-center justify-center shrink-0 shadow-2xs">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">BUILDING</h3>
            <p className="text-sm text-slate-700 leading-snug mt-0.5">{working_on}</p>
          </div>
        </div>

        {/* Looking For Row */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#FF7043] flex items-center justify-center shrink-0 shadow-2xs">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">LOOKING FOR</h3>
            <p className="text-sm text-slate-700 leading-snug mt-0.5">{currently_exploring}</p>
          </div>
        </div>

        {/* Why Connect Row */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#FF7043] flex items-center justify-center shrink-0 shadow-2xs">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-[#157A6E]">WHY CONNECT</h3>
            <p className="text-sm text-slate-700 leading-snug mt-0.5">{bio}</p>
          </div>
        </div>

        {/* Top Interests Section */}
        <div className="pt-2 pb-6">
          <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-500 mb-2">TOP INTERESTS</h3>
          <div className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <span
                key={interest}
                className="px-3 py-1.5 rounded-xl bg-[#FFF8F5] border border-[#FFE8DE] text-slate-800 text-xs font-semibold"
              >
                {interest}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* -- 2. STICKY / FIXED PRIMARY ACTION -- */}
      <div className="px-6 py-4 border-t border-slate-100 bg-white/95 backdrop-blur-md shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <button 
          onClick={onViewFull}
          className="w-full bg-[#157A6E] hover:bg-[#0D6E63] text-white font-semibold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <span>View Full Profile</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
