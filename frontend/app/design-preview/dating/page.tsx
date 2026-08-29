'use client';

import React from 'react';

const MOCK_PROFILE = {
  name: 'Aarav Mehta',
  headline: 'Founder & CEO at PulseAI',
  location: 'Bengaluru, India',
  intent: 'Mentorship',
  workingOn: 'B2B SaaS for premium showrooms',
  bio: 'Building intent-based discovery for India. Passionate about AI agents and early-stage ecosystems. Previously led product initiatives at scale across Bengaluru and Hyderabad.',
  interests: ['Startups', 'SaaS', 'VC / Investing', 'Marketing'],
  skills: ['Entrepreneurship', 'Product Strategy', 'Growth'],
  photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
};

// 1. The "Editorial / Prompt" Style (Inspired by Hinge)
function HingeStyle() {
  return (
    <div className="w-[375px] h-[812px] bg-[#F4F5F6] overflow-y-auto no-scrollbar relative font-sans shadow-2xl rounded-[40px] border-[8px] border-slate-900 ring-1 ring-slate-200">
      <img src={MOCK_PROFILE.photo} className="w-full aspect-[4/4] object-cover" alt="Profile" />
      <div className="px-5 py-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{MOCK_PROFILE.name}</h1>
        <p className="text-slate-600 font-medium mt-1">{MOCK_PROFILE.headline}</p>
        <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          {MOCK_PROFILE.location}
        </p>
      </div>

      <div className="px-5 space-y-4 pb-24">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">I'm looking for</p>
          <p className="text-2xl font-medium font-serif text-[#157A6E] leading-tight">{MOCK_PROFILE.intent}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Currently working on</p>
          <p className="text-[17px] font-medium text-slate-800 leading-snug">{MOCK_PROFILE.workingOn}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">More about me</p>
          <p className="text-[15px] text-slate-700 leading-[1.6]">{MOCK_PROFILE.bio}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Interests</p>
          <div className="flex flex-wrap gap-2.5">
            {MOCK_PROFILE.interests.map(i => (
              <span key={i} className="px-4 py-2 bg-slate-50 rounded-full text-[13px] font-semibold text-slate-700 border border-slate-200/80">
                {i}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#F4F5F6] via-[#F4F5F6]/90 to-transparent pt-12">
        <button className="w-full py-4 rounded-full bg-slate-900 text-white font-bold shadow-xl hover:bg-slate-800 transition-colors">
          Connect with Aarav
        </button>
      </div>
    </div>
  );
}

// 2. The "Card Stack / Vibrant" Style (Inspired by Bumble)
function BumbleStyle() {
  return (
    <div className="w-[375px] h-[812px] bg-white overflow-y-auto no-scrollbar relative font-sans shadow-2xl rounded-[40px] border-[8px] border-slate-900 ring-1 ring-slate-200">
      <div className="p-2">
        <div className="relative w-full aspect-[4/5] rounded-[32px] overflow-hidden shadow-sm">
          <img src={MOCK_PROFILE.photo} className="w-full h-full object-cover" alt="Profile" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6 text-white">
            <h1 className="text-[32px] font-black tracking-tight leading-none mb-2 flex items-center gap-2">
              {MOCK_PROFILE.name}
              <span className="bg-white/20 p-1 rounded-full backdrop-blur-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#157A6E"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              </span>
            </h1>
            <p className="text-white/90 font-semibold text-[15px]">{MOCK_PROFILE.headline}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6 pb-28">
        <div className="bg-teal-50 rounded-3xl p-5 border border-teal-100 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-teal-200/40 rounded-full blur-xl" />
          <span className="bg-[#157A6E] text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-widest mb-3 inline-block shadow-sm">
            Intent
          </span>
          <p className="text-2xl font-extrabold text-teal-950 tracking-tight">{MOCK_PROFILE.intent}</p>
        </div>

        <div>
          <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">About</h3>
          <p className="text-[16px] text-slate-700 leading-relaxed font-medium">{MOCK_PROFILE.bio}</p>
        </div>

        <div>
          <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-3">Interests</h3>
          <div className="flex flex-wrap gap-2.5">
            {MOCK_PROFILE.interests.map(i => (
              <span key={i} className="px-4 py-2 bg-amber-100 text-amber-900 rounded-full text-[13px] font-bold shadow-sm">
                {i}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="absolute bottom-6 right-6">
        <button className="w-16 h-16 bg-[#157A6E] rounded-full shadow-[0_8px_24px_rgba(21,122,110,0.4)] flex items-center justify-center text-white hover:scale-105 transition-transform">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

// 3. The "Cinematic / Exclusive" Style (Inspired by Raya)
function RayaStyle() {
  return (
    <div className="w-[375px] h-[812px] bg-[#0A0D14] overflow-y-auto no-scrollbar relative font-sans shadow-2xl rounded-[40px] border-[8px] border-slate-900 ring-1 ring-slate-200">
      {/* Background Blur */}
      <div className="fixed w-[359px] h-[796px] z-0 overflow-hidden rounded-[32px] pointer-events-none">
        <img src={MOCK_PROFILE.photo} className="w-full h-full object-cover opacity-20 blur-xl scale-110" alt="" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0D14]/30 via-[#0A0D14]/80 to-[#0A0D14]" />
      </div>

      <div className="relative z-10 px-6 pt-10 pb-28">
        <div className="w-full aspect-[3/4] rounded-sm overflow-hidden mb-8 shadow-2xl border border-white/10 relative">
          <img src={MOCK_PROFILE.photo} className="w-full h-full object-cover" alt="Profile" />
          <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <div className="text-center mb-10">
          <h1 className="text-2xl font-light tracking-[0.2em] uppercase text-white/90">{MOCK_PROFILE.name}</h1>
          <p className="text-white/40 text-[10px] uppercase tracking-[0.3em] mt-3">{MOCK_PROFILE.headline}</p>
        </div>

        <div className="space-y-4">
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-xl text-center">
            <p className="text-[9px] text-white/40 uppercase tracking-[0.3em] mb-3">Seeking</p>
            <p className="text-xl font-light tracking-widest text-[#2DD4BF] uppercase">{MOCK_PROFILE.intent}</p>
          </div>
          
          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 rounded-xl">
            <p className="text-white/60 text-[13px] leading-[2] font-light text-center tracking-wide">{MOCK_PROFILE.bio}</p>
          </div>

          <div className="pt-4 flex justify-center flex-wrap gap-3">
             {MOCK_PROFILE.interests.slice(0,3).map(i => (
               <span key={i} className="text-[10px] uppercase tracking-widest text-white/30 border border-white/10 px-4 py-2 rounded-sm">
                 {i}
               </span>
             ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-[#0A0D14] via-[#0A0D14] to-transparent flex justify-center z-20">
        <button className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center text-white/80 hover:bg-white/10 backdrop-blur-md transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  );
}

export default function DatingStylesShowcase() {
  return (
    <div className="min-h-screen bg-slate-100 py-12 px-8 flex flex-col items-center">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">Dating App UI Inspirations</h1>
        <p className="text-slate-500 text-lg">Three distinct aesthetic directions for the BYN profile view.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-12 max-w-7xl mx-auto">
        {/* Style 1 */}
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-800">The "Editorial" Style</h2>
            <p className="text-sm text-slate-500 mt-1">Inspired by Hinge. Conversational, clean, structured.</p>
          </div>
          <HingeStyle />
        </div>

        {/* Style 2 */}
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-800">The "Vibrant Stack" Style</h2>
            <p className="text-sm text-slate-500 mt-1">Inspired by Bumble. Bold, friendly, app-native.</p>
          </div>
          <BumbleStyle />
        </div>

        {/* Style 3 */}
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-800">The "Cinematic" Style</h2>
            <p className="text-sm text-slate-500 mt-1">Inspired by Raya. Ultra-premium, exclusive, minimal.</p>
          </div>
          <RayaStyle />
        </div>
      </div>
    </div>
  );
}
