/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import MobileHeader from '@/components/layout/MobileHeader';
import SwipeCard from '@/components/discover/SwipeCard';
import ProfileView from '@/components/profile/ProfileView';
import { ToastProvider } from '@/components/ui/Toast';
import type { User } from '@/lib/types';

const SAMPLE_PROFILE = {
  user: {
    id: 'user-founder-1',
    name: 'Aarav Sharma',
    photos: [
      '/assets/sample-founder-1.jpg',
      '/assets/sample-founder-2.jpg',
    ],
    headline: 'Founder & CEO @ NeuroFlow · Bengaluru',
    location: 'Bengaluru, India',
    intent: 'find-cofounder',
    interests: ['Autonomous AI', 'Climate Tech', 'Distributed Systems', 'High-Framerate UX', 'Clean Energy'],
    skills: ['Distributed Systems', 'PyTorch', 'Next.js', 'System Architecture', 'Edge AI Models', 'TypeScript', 'WebGL'],
    working_on: 'Autonomous energy grid optimization network built with edge AI models. Deploying decentralized real-time inference nodes to dynamically balance municipal power distribution across regional smart grids.',
    currently_exploring: 'A world-class Principal Frontend Engineer & Design Partner obsessed with high-framerate data visualizations, WebGL telemetry dashboards, and reactive system architecture.',
    bio: 'Serial builder and systems architect passionate about edge computing, real-time grid orchestration, and high-framerate interfaces. Previously scaled streaming pipelines at Gridlytics handling 40M+ daily events. Looking for someone with deep frontend taste to build our core interface from zero to one.',
    trust_score: 95,
    profile_score: 98,
    verified: true,
  } as unknown as User,
  match_score: 96,
};

const CHAT_MESSAGES = [
  { id: '1', text: 'Hey Aarav! Loved your open-source work on autonomous energy grid optimization.', isMe: true, time: '10:14 AM' },
  { id: '2', text: 'Hey there! Thanks so much. We just shipped the edge model orchestration pipeline yesterday.', isMe: false, time: '10:15 AM' },
  { id: '3', text: 'Saw that you are looking for a Founding Frontend Engineer & Design Partner. I have built high-framerate Next.js & WebGL data visualization systems at scale.', isMe: true, time: '10:16 AM' },
  { id: '4', text: 'That is exactly what we need for our real-time grid telemetry interfaces! Are you free for a quick 15-minute intro call this Thursday at 4 PM IST?', isMe: false, time: '10:18 AM' },
  { id: '5', text: 'Thursday 4 PM IST works perfectly for me! I will send over a calendar invite and a preview link of my previous design systems.', isMe: true, time: '10:20 AM' },
  { id: '6', text: 'Awesome, looking forward to it. Catch you on Thursday!', isMe: false, time: '10:22 AM' },
  { id: '7', text: 'Sounds great! See you then! 🚀', isMe: true, time: '10:23 AM' },
  { id: '8', text: 'Got it!', isMe: true, time: '10:24 AM' },
];

function PreviewContent() {
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') as 'swipe' | 'circles' | 'chat' | 'connect' | 'full_profile') || 'swipe';

  const [view, setView] = useState<'swipe' | 'circles' | 'chat' | 'connect' | 'full_profile'>(initialView);

  useEffect(() => {
    const qView = searchParams.get('view');
    if (qView === 'swipe' || qView === 'circles' || qView === 'chat' || qView === 'connect' || qView === 'full_profile') {
      setView(qView);
    }
  }, [searchParams]);

  return (
    <div className="w-full min-h-screen bg-white font-sans text-left">
      
      {/* -- DESKTOP 3-COLUMN WORKSPACE (Visible on desktop viewports) -------- */}
      <div className="hidden lg:flex w-full h-screen bg-[#F8F9FA] text-left overflow-hidden">
        
        {/* Left Sidebar (240px) */}
        <div className="w-[240px] bg-white border-r border-slate-200 flex flex-col justify-between p-5 shrink-0">
          <div className="space-y-6">
            <div className="flex items-center gap-2.5">
              <img src="/assets/logo.png" alt="BYN" className="h-6 w-auto object-contain" />
              <span className="font-extrabold text-base tracking-tight text-slate-900">BuildYourNetwork</span>
            </div>

            <nav className="space-y-1">
              <button 
                onClick={() => setView('swipe')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  view === 'swipe' ? 'bg-[#157A6E]/10 text-[#157A6E]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span>Discover</span>
              </button>

              <button 
                onClick={() => setView('circles')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  view === 'circles' ? 'bg-[#157A6E]/10 text-[#157A6E]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span>Circles</span>
              </button>

              <button 
                onClick={() => setView('chat')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  view === 'chat' ? 'bg-[#157A6E]/10 text-[#157A6E]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Chats</span>
                <span className="ml-auto bg-[#157A6E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">1</span>
              </button>

              <button 
                onClick={() => setView('connect')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  view === 'connect' ? 'bg-[#157A6E]/10 text-[#157A6E]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span>Connect</span>
              </button>

              <button 
                onClick={() => setView('full_profile')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  view === 'full_profile' ? 'bg-[#157A6E]/10 text-[#157A6E]' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Profile</span>
              </button>
            </nav>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#157A6E] text-white font-bold text-xs flex items-center justify-center">
              ME
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900">Founding Engineer</span>
              <span className="text-[10px] text-slate-400 font-medium">Online</span>
            </div>
          </div>
        </div>

        {/* Center Main Workspace (Scrollable feed / chat) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-slate-200">
          {view === 'swipe' && (
            <div className="flex-1 h-full overflow-y-auto bg-white no-scrollbar">
              <div className="w-full max-w-3xl mx-auto min-h-full bg-white">
                <SwipeCard
                  profile={SAMPLE_PROFILE as any}
                  onConnect={async () => {}}
                  onSkip={() => {}}
                  onInspect={() => setView('full_profile')}
                />
              </div>
            </div>
          )}

          {view === 'chat' && (
            <div className="flex-1 flex flex-col h-full bg-white">
              {/* Chat Header */}
              <div className="px-5 py-3 border-b border-slate-200/60 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img src="/assets/sample-founder-1.jpg" alt="Aarav" className="w-9 h-9 rounded-full object-cover" />
                    <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-[1.5px] border-white rounded-full"></span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                      <span>Aarav Sharma</span>
                      <svg className="w-3.5 h-3.5 text-[#157A6E]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </h2>
                    <p className="text-xs text-slate-400">Looking for: Co-founder</p>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-[#E65100] bg-[#FFF3EE] px-2 py-0.5 rounded">
                  Priority · 18h left
                </span>
              </div>

              {/* Message Canvas -- white background, no panel */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="w-full max-w-2xl mx-auto px-5 py-4">
                  <div className="text-center mb-5">
                    <span className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">
                      Match Established · Today
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {CHAT_MESSAGES.map((m) => (
                      <div key={m.id} className={`flex w-full ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                        {!m.isMe && (
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center mr-2 mt-auto shrink-0">
                            AS
                          </div>
                        )}
                        <div className={`max-w-[72%] sm:max-w-[60%] px-3.5 py-2 text-sm leading-[1.45] rounded-xl break-words ${
                          m.isMe ? 'bg-[#157A6E] text-white' : 'bg-[#F3F4F6] text-slate-900'
                        }`}>
                          <p>{m.text}</p>
                          <div className={`flex items-center gap-1 mt-0.5 text-[9px] ${m.isMe ? 'text-white/50 justify-end' : 'text-slate-400'}`}>
                            <span>{m.time}</span>
                            {m.isMe && <span>✓✓</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="px-5 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {[
                  { label: 'Propose Time', icon: '📅' },
                  { label: 'Tech Stack Details', icon: '🚀' },
                  { label: 'Share Portfolio', icon: '📁' },
                ].map(chip => (
                  <button key={chip.label} className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1">
                    <span>{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              {/* Composer */}
              <div className="px-5 py-3 bg-white border-t border-slate-100 flex items-center gap-2.5 shrink-0">
                <button className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14"/></svg>
                </button>
                <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 flex items-center px-3.5 py-2">
                  <input type="text" placeholder="Write a message to Aarav..." className="flex-1 bg-transparent text-sm focus:outline-none text-slate-900 placeholder:text-slate-400" />
                </div>
                <button className="w-9 h-9 rounded-lg bg-[#157A6E] text-white flex items-center justify-center hover:bg-[#0D6E63] transition-all cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
            </div>
          )}

          {view === 'full_profile' && (
            <div className="flex-1 h-full overflow-y-auto no-scrollbar">
              <ProfileView user={SAMPLE_PROFILE.user!} onBack={() => setView('swipe')} />
            </div>
          )}
        </div>

        {/* Right Sidebar: Real-time Profile Inspector (360px) */}
        <div className="w-[360px] bg-white flex flex-col min-h-0 overflow-y-auto p-6 space-y-6 shrink-0">
          <div className="flex items-center gap-3.5">
            <img src="/assets/sample-founder-1.jpg" alt="Aarav" className="w-14 h-14 rounded-xl object-cover" />
            <div>
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-1.5">
                <span>Aarav Sharma</span>
                <svg className="w-4 h-4 text-[#157A6E]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </h3>
              <p className="text-xs text-slate-500 font-medium">Founder & CEO @ NeuroFlow</p>
              <div className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-[#157A6E] bg-teal-50 border border-teal-200/70 px-2 py-0.5 rounded-md">
                🛡️ Trust Score 95
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-1.5">BUILDING</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              Autonomous energy grid optimization network built with edge AI models. Deploying decentralized real-time inference nodes.
            </p>
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-1.5">LOOKING FOR</h4>
            <p className="text-sm text-slate-700 leading-relaxed">
              World-class Principal Frontend Engineer & Design Partner obsessed with high-framerate UX.
            </p>
          </div>

          <div className="h-px bg-slate-100" />

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] mb-2.5">SKILLS</h4>
            <div className="flex flex-wrap gap-1.5">
              {['Distributed Systems', 'PyTorch', 'Next.js', 'System Architecture', 'Edge AI Models'].map(s => (
                <span key={s} className="bg-slate-50 border border-slate-200/80 text-slate-700 text-xs px-2.5 py-1 rounded-md font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE CONTAINER (< 1024px) */}
      <div className="flex lg:hidden w-full min-h-screen bg-white flex-col relative font-sans">
        
        {view === 'full_profile' && (
          <div className="w-full min-h-screen bg-white" id="profile-view">
            <ProfileView 
              user={SAMPLE_PROFILE.user!} 
              onBack={() => setView('swipe')}
            />
          </div>
        )}

        {view === 'swipe' && (
          <div className="w-full min-h-screen flex flex-col relative bg-white" id="swipe-view">
             <MobileHeader rightAction={
                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-semibold text-slate-700 cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="4" x2="20" y1="7" y2="7"/></svg>
                  <span>Filters</span>
                </button>
             } />

             {/* Continuous Vertical Feed Document */}
             <div className="w-full flex-1 pb-[72px]">
                <SwipeCard
                  profile={SAMPLE_PROFILE as any}
                  onConnect={async () => {}}
                  onSkip={() => {}}
                  onInspect={() => setView('full_profile')}
                />
             </div>

             {/* Bottom Navigation (5 Tabs: Discover | Circles | Chats | Connect | Profile) */}
             <div className="fixed bottom-0 inset-x-0 h-[56px] border-t border-slate-100 bg-white/95 backdrop-blur-md px-3 flex items-center justify-around z-40">
                <button onClick={() => setView('swipe')} className="flex flex-col items-center gap-1 min-w-[48px] text-[#157A6E] cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <span className="text-[10px] font-bold">Discover</span>
                </button>
                <button onClick={() => setView('circles')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  <span className="text-[10px] font-medium">Circles</span>
                </button>
                <button onClick={() => setView('chat')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span className="text-[10px] font-medium">Chats</span>
                </button>
                <button onClick={() => setView('connect')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  <span className="text-[10px] font-medium">Connect</span>
                </button>
                <button onClick={() => setView('full_profile')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className="text-[10px] font-medium">Profile</span>
                </button>
             </div>
          </div>
        )}

        {view === 'circles' && (
          <div className="w-full min-h-screen flex flex-col bg-white" id="circles-view">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h1 className="text-base font-extrabold text-slate-900">Circles</h1>
              <button className="text-xs font-bold text-[#157A6E] bg-teal-50 px-2.5 py-1 rounded-lg cursor-pointer">
                + Create
              </button>
            </div>
            <div className="flex-1 p-5 space-y-4 pb-20">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">⚡</span>
                  <h3 className="font-bold text-sm text-slate-900">AI Founders Circle</h3>
                  <span className="text-[10px] text-slate-400 ml-auto">128 members</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Weekly build syncs, edge model deployment discussions, and co-founder matchmaking.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🚀</span>
                  <h3 className="font-bold text-sm text-slate-900">Bengaluru Builders</h3>
                  <span className="text-[10px] text-slate-400 ml-auto">342 members</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In-person demo days and product feedback sessions across Indiranagar & HSR.
                </p>
              </div>
            </div>
            {/* Bottom Navigation */}
            <div className="fixed bottom-0 inset-x-0 h-[56px] border-t border-slate-100 bg-white/95 backdrop-blur-md px-3 flex items-center justify-around z-40">
              <button onClick={() => setView('swipe')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span className="text-[10px] font-medium">Discover</span>
              </button>
              <button onClick={() => setView('circles')} className="flex flex-col items-center gap-1 min-w-[48px] text-[#157A6E] cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span className="text-[10px] font-bold">Circles</span>
              </button>
              <button onClick={() => setView('chat')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span className="text-[10px] font-medium">Chats</span>
              </button>
              <button onClick={() => setView('connect')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span className="text-[10px] font-medium">Connect</span>
              </button>
              <button onClick={() => setView('full_profile')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="text-[10px] font-medium">Profile</span>
              </button>
            </div>
          </div>
        )}

        {view === 'connect' && (
          <div className="w-full min-h-screen flex flex-col bg-white" id="connect-view">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h1 className="text-base font-extrabold text-slate-900">Connections</h1>
              <span className="text-xs font-bold text-[#E65100] bg-[#FFF0EB] px-2 py-0.5 rounded-md">
                3 Pending
              </span>
            </div>
            <div className="flex-1 p-5 space-y-3 pb-20">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-3">
                <img src="/assets/sample-founder-1.jpg" alt="Aarav" className="w-11 h-11 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">Aarav Sharma</h3>
                  <p className="text-xs text-slate-500 truncate">Founder & CEO @ NeuroFlow</p>
                </div>
                <button onClick={() => setView('chat')} className="px-3 py-1.5 rounded-lg bg-[#157A6E] text-white text-xs font-bold cursor-pointer">
                  Chat
                </button>
              </div>
            </div>
            {/* Bottom Navigation */}
            <div className="fixed bottom-0 inset-x-0 h-[56px] border-t border-slate-100 bg-white/95 backdrop-blur-md px-3 flex items-center justify-around z-40">
              <button onClick={() => setView('swipe')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span className="text-[10px] font-medium">Discover</span>
              </button>
              <button onClick={() => setView('circles')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                <span className="text-[10px] font-medium">Circles</span>
              </button>
              <button onClick={() => setView('chat')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span className="text-[10px] font-medium">Chats</span>
              </button>
              <button onClick={() => setView('connect')} className="flex flex-col items-center gap-1 min-w-[48px] text-[#157A6E] cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span className="text-[10px] font-bold">Connect</span>
              </button>
              <button onClick={() => setView('full_profile')} className="flex flex-col items-center gap-1 min-w-[48px] text-slate-400 hover:text-slate-600 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="text-[10px] font-medium">Profile</span>
              </button>
            </div>
          </div>
        )}

        {view === 'chat' && (
          <div className="fixed inset-0 w-full h-full flex flex-col bg-white overflow-hidden" id="chat-view">
             {/* Chat Header */}
             <div className="px-4 py-2.5 border-b border-slate-200/60 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2.5">
                   <button onClick={() => setView('swipe')} className="p-1 -ml-1 text-slate-500 hover:text-slate-900 cursor-pointer">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
                   </button>
                   <div className="relative">
                      <img src="/assets/sample-founder-1.jpg" alt="Aarav" className="w-8 h-8 rounded-full object-cover" />
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-[1.5px] border-white rounded-full"></span>
                   </div>
                   <div className="flex flex-col text-left">
                      <h1 className="text-[13px] font-semibold text-slate-900 leading-tight flex items-center gap-1">
                        <span>Aarav Sharma</span>
                        <svg className="w-3.5 h-3.5 text-[#157A6E] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </h1>
                      <span className="text-[10px] text-slate-400">Looking for: Co-founder</span>
                   </div>
                </div>
                <span className="text-[10px] font-bold text-[#E65100] bg-[#FFF0EB] border border-[#FFE0D2] px-2 py-0.5 rounded-md">
                   Priority · 18h left
                </span>
             </div>

             {/* Message Canvas -- white background, no panel, scrollbar on outer viewport */}
             <div className="flex-1 min-h-0 overflow-y-auto text-left">
                <div className="w-full px-4 py-3">
                   <div className="text-center mb-4">
                      <span className="text-[9px] uppercase tracking-widest font-semibold text-slate-400">
                         Match Established · Today
                      </span>
                   </div>

                   <div className="space-y-2">
                     {CHAT_MESSAGES.map((m) => (
                       <div key={m.id} className={`w-full flex items-end gap-2 ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                         {!m.isMe && (
                           <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                             AS
                           </div>
                         )}
                         <div className={`flex flex-col min-w-0 max-w-[72%] ${m.isMe ? 'items-end' : 'items-start'}`}>
                           <div
                             className={`w-fit px-3.5 py-2 text-[13px] leading-[1.45] rounded-2xl break-words ${
                               m.isMe
                                 ? 'bg-[#157A6E] text-white rounded-br-sm'
                                 : 'bg-[#F3F4F6] text-slate-900 rounded-bl-sm'
                             }`}
                           >
                             <p className="m-0">{m.text}</p>
                           </div>
                           <div className={`flex items-center gap-1 mt-0.5 text-[9px] text-slate-400`}>
                             <span>{m.time}</span>
                             {m.isMe && <span className="text-[#157A6E]">✓✓</span>}
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                </div>
             </div>

             {/* Quick Actions */}
             <div className="px-5 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { label: 'Propose Time', icon: '📅' },
                  { label: 'Tech Stack', icon: '🚀' },
                  { label: 'Share Deck', icon: '📁' },
                ].map(chip => (
                  <button
                    key={chip.label}
                    className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  >
                    <span>{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
             </div>

             {/* Composer */}
             <div className="px-4 pt-2 pb-6 bg-white flex items-center gap-2 shrink-0" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
                <button className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer hover:bg-slate-200 transition-colors">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14"/></svg>
                </button>
                <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 flex items-center px-3 py-2">
                   <input
                      type="text"
                      placeholder="Message..."
                      className="flex-1 bg-transparent text-[13px] focus:outline-none text-slate-900 placeholder:text-slate-400"
                   />
                   <button className="text-slate-400 hover:text-slate-600 ml-1 cursor-pointer">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                   </button>
                </div>
                <button className="w-8 h-8 rounded-lg bg-[#157A6E] text-white flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#0D6E63] active:scale-95 transition-all">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MobilePreviewPage() {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="w-full h-screen bg-white" />}>
        <PreviewContent />
      </Suspense>
    </ToastProvider>
  );
}
