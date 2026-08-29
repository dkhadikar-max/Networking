'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import SwipeCard from '@/components/discover/SwipeCard';
import MatchModal from '@/components/discover/MatchModal';
import CirclePostCard from '@/components/circles/CirclePostCard';
import Avatar from '@/components/ui/Avatar';
import { ToastProvider } from '@/components/ui/Toast';
import '../(app)/app.css';
import type { DiscoverProfile, CirclePost, User } from '@/lib/types';

// -- Sample Profiles for Interactive Discovery Showcase ----------------------
const SAMPLE_PROFILES: { role: string; profile: DiscoverProfile }[] = [
  {
    role: 'Founder',
    profile: {
      user: {
        id: 'user-founder-1',
        name: 'Aarav Sharma',
        email_verified: true,
        onboarding_stage: 'complete',
        photos: [
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=800&q=80',
        ],
        headline: 'Founder & CEO @ NeuroFlow · Bengaluru',
        location: 'Bengaluru, India',
        intent: 'find-cofounder',
        interests: ['Autonomous AI', 'Climate Tech', 'Distributed Systems'],
        skills: ['Distributed Systems', 'PyTorch', 'Next.js', 'System Architecture'],
        working_on: 'Autonomous energy grid optimization network built with edge AI models.',
        currently_exploring: 'World-class Principal Frontend Engineer & Design Partner.',
        bio: 'Serial builder, previously built scalable data pipelines. Looking for someone obsessed with high-framerate UX to build our core interface.',
        trust_score: 95,
        profile_score: 98,
        is_profile_complete: true,
        verified: true,
        identity_verified: true,
      } as unknown as User,
      match_score: 96,
      matchReasons: [
        'Both building in autonomous AI & systems',
        'Complementary skills (AI Backend ↔ Frontend Design)',
        'Shared intent: High-velocity co-founder partnership',
      ],
    },
  },
  {
    role: 'Developer',
    profile: {
      user: {
        id: 'user-dev-2',
        name: 'Elena Rostova',
        email_verified: true,
        onboarding_stage: 'complete',
        photos: [
          'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
        ],
        headline: 'Staff Frontend Engineer · WebGL & React 19',
        location: 'Berlin / Remote',
        intent: 'join-startup',
        interests: ['Spatial UI', 'WebAssembly', 'Open Source', 'Micro-interactions'],
        skills: ['React 19', 'WebGL', 'TypeScript', 'Tailwind CSS'],
        working_on: '60fps graph-visualization engine for large-scale knowledge graphs.',
        currently_exploring: 'Ambitious early-stage founder with high design taste and clear market thesis.',
        bio: 'Ex-Linear UI engineer. Obsessed with zero-latency interactions, accessibility (WCAG AA), and tactile fluid animations.',
        trust_score: 91,
        profile_score: 94,
        is_profile_complete: true,
        verified: true,
        identity_verified: true,
      } as unknown as User,
      match_score: 92,
      matchReasons: [
        'Mutual focus on elite frontend craft & performance',
        'Matches your need for a technical co-builder',
      ],
    },
  },
  {
    role: 'Designer',
    profile: {
      user: {
        id: 'user-designer-3',
        name: 'Meera Nair',
        email_verified: true,
        onboarding_stage: 'complete',
        photos: [
          'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80',
        ],
        headline: 'Lead Product Designer · Design Systems',
        location: 'Bengaluru, India',
        intent: 'find-cofounder',
        interests: ['Typography Systems', 'Async Workflows', 'Design Ergonomics'],
        skills: ['Design Systems', 'Figma to Code', 'User Research', 'Microcopy'],
        working_on: 'Design-tech platform for seamless async product and design reviews.',
        currently_exploring: 'Technical co-founder with distributed systems experience.',
        bio: 'Designing human-centric tools for builders. Believer in zero design debt and accessible, beautiful defaults.',
        trust_score: 93,
        profile_score: 95,
        is_profile_complete: true,
        verified: true,
        identity_verified: true,
      } as unknown as User,
      match_score: 94,
      matchReasons: [
        'Top 5% design system craftsmanship in Bengaluru',
        'Strong overlap in async collaboration philosophy',
      ],
    },
  },
];

// -- Sample Circles Post -----------------------------------------------------
const SAMPLE_CIRCLE_POST: CirclePost = {
  id: 'preview-circle-post-1',
  user_id: 'user-founder-1',
  text: "We just open-sourced our real-time intent-matching algorithm for async founder networks. Seeking feedback on token-bucket rate limits and Framer Motion drag ergonomics. Let's build together!",
  tags: ['Building', 'Open Source', 'Launching', 'Collab'],
  structured_meta: {
    looking_for: 'Principal Frontend Engineer',
    building: 'BYN Intent Discovery Engine',
    industry: 'Social / Professional SaaS',
    skill_level: 'Staff / Lead',
    timeline: 'Immediate Q3 2026',
  },
  links: [],
  created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  like_count: 24,
  liked_by_me: false,
  group_id: null,
  author: {
    id: 'user-founder-1',
    name: 'Aarav Sharma',
    photos: [],
    intent: 'find-cofounder',
    trust_score: 95,
    last_active: new Date().toISOString(),
    headline: 'Founder & CEO @ NeuroFlow',
  },
};

// -- Design Tokens Dataset ---------------------------------------------------
const TEAL_TOKENS = [
  { name: '--primary', hex: '#157A6E', desc: 'Core Brand & Primary Actions', textClass: 'text-white' },
  { name: '--primary-dark', hex: '#0D5F58', desc: 'Hover & Focused Depth', textClass: 'text-white' },
  { name: '--primary-2', hex: '#1DB7A6', desc: 'Vibrant Accent Gradient Stop', textClass: 'text-white' },
  { name: '--primary-light', hex: '#CCFBF1', desc: 'Subtle Highlighting & Badges', textClass: 'text-[#064E4E]' },
  { name: '--teal-dark', hex: '#064E4E', desc: 'Deep Backdrop & Canvas Depth', textClass: 'text-white' },
];

const GOLD_TOKENS = [
  { name: '--accent', hex: '#F4A259', desc: 'Warm Coral Gold Brand CTA', textClass: 'text-white' },
  { name: '--accent-light', hex: '#FFF4E7', desc: 'Soft Gold Chip & Banner Tint', textClass: 'text-[#92400E]' },
  { name: '--accent-text', hex: '#92400E', desc: 'WCAG AA Compliant Text on Gold (6.5:1)', textClass: 'text-white' },
  { name: '--gold-glow', hex: 'rgba(244,162,89,0.25)', desc: 'Elevation & Interactive Glow', textClass: 'text-slate-800' },
];

const SURFACE_TOKENS = [
  { name: '--bg', hex: '#F6F8FA', label: 'Canvas Background' },
  { name: '--card', hex: '#FFFFFF', label: 'Elevated Card Surface' },
  { name: '--sur2', hex: '#F8FAFC', label: 'Subtle Input / Secondary Surface' },
  { name: '--border', hex: '#E2E8F0', label: 'Crisp Architectural Border' },
];

const TYPOGRAPHY_SCALE = [
  { label: 'Display Hero', size: '32px', weight: '800 (ExtraBold)', tracking: '-0.04em', sample: 'Professional Networking — By Intent' },
  { label: 'Heading 1', size: '24px', weight: '800 (ExtraBold)', tracking: '-0.03em', sample: 'Discover Relevant Builders' },
  { label: 'Heading 2', size: '20px', weight: '700 (Bold)', tracking: '-0.02em', sample: 'Connect with High-Trust Peers' },
  { label: 'Heading 3', size: '16px', weight: '700 (Bold)', tracking: '-0.01em', sample: 'Structured Intent Metadata' },
  { label: 'Body Text', size: '14px', weight: '500 (Medium)', tracking: 'normal', sample: 'Every profile displays verified credentials, active projects, and collaboration signals.' },
  { label: 'Caption / Meta', size: '11px', weight: '700 (Bold)', tracking: '0.06em', sample: 'VERIFIED · 96% MATCH · ACTIVE NOW' },
];

const CONTEXT_CHIPS_DEMO = [
  'All Signals',
  'Finding Co-founder',
  'Hiring Staff Frontend',
  'AI / ML Systems',
  'Design Systems',
  'Angel Investment',
  'Remote (Worldwide)',
];

export default function DesignPreviewPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'swipe' | 'chat' | 'notifications' | 'match' | 'circles' | 'tokens'>('all');
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);
  const [previewChatMessages, setPreviewChatMessages] = useState<{ id: string; text: string; isMe: boolean; time: string }[]>([
    { id: '1', text: 'Hey Aarav! Loved your work on autonomous energy grid optimization.', isMe: true, time: '10:14 AM' },
    { id: '2', text: 'Hey there! Thanks so much. We just open-sourced the edge model orchestration repo.', isMe: false, time: '10:15 AM' },
    { id: '3', text: 'Are you free for a quick 15-minute intro call this week to discuss co-founder alignment?', isMe: false, time: '10:16 AM' },
  ]);
  const [chatInputText, setChatInputText] = useState('');
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [activeChip, setActiveChip] = useState('All Signals');
  const [previewViewport, setPreviewViewport] = useState<'fluid' | 'mobile' | 'tablet'>('fluid');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [connectNotification, setConnectNotification] = useState<string | null>(null);

  const currentProfile = SAMPLE_PROFILES[selectedProfileIdx].profile;

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToken(text);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }, []);

  const handleConnect = useCallback(async () => {
    const name = (currentProfile.user as { name?: string })?.name ?? 'Builder';
    setConnectNotification(`Connection requested with ${name}! 🎉`);
    setTimeout(() => {
      setConnectNotification(null);
      setMatchModalOpen(true);
    }, 600);
  }, [currentProfile]);

  const handleSkip = useCallback(() => {
    setSelectedProfileIdx(prev => (prev + 1) % SAMPLE_PROFILES.length);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans antialiased pb-24">
      {/* -- Top Header -------------------------------------------------------- */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#157A6E] to-[#0E5E55] flex items-center justify-center shadow-md shadow-[#157A6E]/20 group-hover:scale-105 transition-transform">
                <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
                  <circle cx="25" cy="25" r="10" fill="#1DB7A6" />
                  <circle cx="75" cy="50" r="16" fill="#1DB7A6" />
                  <circle cx="25" cy="75" r="10" fill="#F4A259" />
                  <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round" />
                  <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round" />
                  <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <span className="font-extrabold font-display text-base sm:text-lg tracking-tight text-slate-900 flex items-center gap-1.5">
                  Build Your Network
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#CCFBF1] text-[#064E4E] border border-[#157A6E]/20">
                    UI/UX Preview
                  </span>
                </span>
              </div>
            </Link>
          </div>

          {/* Section Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
            {(['all', 'swipe', 'chat', 'notifications', 'match', 'circles', 'tokens'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold capitalize transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-white text-[#157A6E] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all' ? 'All Modules' : tab === 'swipe' ? 'Swipe Cards' : tab === 'chat' ? 'Premium Chat' : tab === 'notifications' ? 'Notifications' : tab === 'match' ? 'Celebration' : tab === 'circles' ? 'Circles & Chips' : 'Design Tokens'}
              </button>
            ))}
          </nav>

          {/* Viewport Simulation Controls */}
          <div className="hidden lg:flex items-center gap-1 text-xs text-slate-500 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setPreviewViewport('fluid')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${previewViewport === 'fluid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
              title="Responsive Fluid Layout"
            >
              Fluid
            </button>
            <button
              onClick={() => setPreviewViewport('tablet')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${previewViewport === 'tablet' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
              title="Tablet Shell (768px)"
            >
              Tablet (768px)
            </button>
            <button
              onClick={() => setPreviewViewport('mobile')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${previewViewport === 'mobile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
              title="Mobile Shell (375px)"
            >
              Mobile (375px)
            </button>
          </div>
        </div>
      </header>

      {/* -- Toast Notification Banner ------------------------------------------ */}
      <AnimatePresence>
        {connectNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-[#157A6E] text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 border border-teal-300/40"
          >
            <span>✓</span> {connectNotification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* -- Main Container ---------------------------------------------------- */}
      <main className={`mx-auto px-4 sm:px-6 lg:px-8 pt-8 transition-all duration-300 ${
        previewViewport === 'mobile' ? 'max-w-[420px]' : previewViewport === 'tablet' ? 'max-w-[800px]' : 'max-w-7xl'
      }`}>

        {/* Hero Section */}
        <section className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF4E7] border border-[#F4A259]/30 text-[#92400E] text-xs font-extrabold uppercase tracking-wider mb-3">
            ✨ Design System & Interactive Component Lab
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            Build Your Network UI/UX Showcase
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Live interactive components built with React 19, Framer Motion, and Tailwind CSS tokens. Test real gesture interactions, accessible micro-states, and design token compliance.
          </p>
        </section>

        {/* -- 1. LIVE SWIPE CARDS & DISCOVERY SHOWCASE ------------------------ */}
        {(activeTab === 'all' || activeTab === 'swipe') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎴</span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Interactive Swipe Experience
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Switch between sample builder profiles. Test drag/touch swiping, Connect/Skip signals, and priority fab modal.
                </p>
              </div>

              {/* Profile Selector Tabs */}
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                {SAMPLE_PROFILES.map((item, idx) => (
                  <button
                    key={item.role}
                    onClick={() => setSelectedProfileIdx(idx)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedProfileIdx === idx
                        ? 'bg-[#157A6E] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {item.role} ({(item.profile.user as { name?: string })?.name?.split(' ')[0]})
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-8">
              {/* Swipe Card Preview Container - Spacious full-height frame */}
              <div className="lg:col-span-6 flex flex-col items-center justify-center min-h-[660px] bg-slate-100/60 rounded-3xl p-3 sm:p-6 border border-slate-200/80">
                <div className="w-full max-w-[480px] h-[640px] sm:h-[680px]">
                  <SwipeCard
                    key={currentProfile.user?.id}
                    profile={currentProfile}
                    onConnect={handleConnect}
                    onSkip={handleSkip}
                    onInspect={() => alert(`Inspecting ${(currentProfile.user as { name?: string })?.name}'s full profile.`)}
                  />
                </div>
                <div className="flex items-center justify-center gap-3 mt-4 text-xs font-semibold text-slate-500">
                  <span>💡 Tip: Drag card left to Skip, right to Connect, or use the bottom action dock</span>
                </div>
              </div>

              {/* Live Profile Metadata & Controls Panel */}
              <div className="lg:col-span-6 flex flex-col gap-5">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#157A6E] block mb-2">
                    Active Profile Architecture
                  </span>
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar name={(currentProfile.user as { name?: string })?.name ?? 'User'} size={48} online />
                    <div>
                      <h3 className="font-extrabold text-base text-slate-900">
                        {(currentProfile.user as { name?: string })?.name}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {(currentProfile.user as { headline?: string })?.headline}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 font-bold block mb-1">MATCH RELEVANCE</span>
                      <span className="text-emerald-700 font-extrabold text-base">
                        {currentProfile.match_score}% High Alignment
                      </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="text-slate-400 font-bold block mb-1">TRUST SCORE</span>
                      <span className="text-[#157A6E] font-extrabold text-base">
                        {(currentProfile.user as { trust_score?: number })?.trust_score}/100 Verified
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-800">What they are building:</span>
                      <p className="mt-0.5 leading-relaxed">{(currentProfile.user as { working_on?: string })?.working_on}</p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-800">Looking to collaborate with:</span>
                      <p className="mt-0.5 leading-relaxed">{(currentProfile.user as { currently_exploring?: string })?.currently_exploring}</p>
                    </div>
                  </div>
                </div>

                {/* Interactive Action Shortcuts */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleConnect}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#157A6E] to-[#1DB7A6] text-white font-bold text-sm shadow-md shadow-[#157A6E]/20 hover:opacity-95 active:scale-98 transition-all cursor-pointer"
                  >
                    Simulate Connect Signal →
                  </button>
                  <button
                    onClick={handleSkip}
                    className="py-3 px-4 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 active:scale-98 transition-all cursor-pointer"
                  >
                    Next Profile ↻
                  </button>
                  <button
                    onClick={() => setMatchModalOpen(true)}
                    className="py-3 px-4 rounded-xl bg-[#FFF4E7] border border-[#F4A259]/40 text-[#92400E] font-bold text-sm hover:bg-[#FFE8D1] active:scale-98 transition-all cursor-pointer"
                  >
                    Trigger Match Modal 🎉
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* -- 2. MATCH CELEBRATION MODAL -------------------------------------- */}
        {(activeTab === 'all' || activeTab === 'match') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎉</span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Match Celebration Experience
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  High-energy celebration modal with Framer Motion spring physics, dual avatar confluence, and gold spark particle effect.
                </p>
              </div>

              <button
                onClick={() => setMatchModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#F4A259] text-white font-extrabold text-sm shadow-md shadow-[#F4A259]/30 hover:bg-[#e79247] transition-all cursor-pointer"
              >
                Launch Celebration Modal
              </button>
            </div>

            <div className="mt-8 p-8 rounded-2xl bg-gradient-to-br from-teal-50/50 via-slate-50 to-amber-50/40 border border-slate-200 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-md mx-auto flex items-center justify-center text-3xl mb-4 border border-slate-100">
                  ✨
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Mutual Intent Match Architecture
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-5">
                  When two builders reciprocate interest, BYN automatically fires the celebratory Match Modal, opening direct unhindered communication.
                </p>
                <button
                  onClick={() => setMatchModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#157A6E] text-white font-bold text-sm shadow-md hover:bg-[#0D5F58] transition-all cursor-pointer"
                >
                  <span>Preview Animation Modal</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* -- 3. PREMIUM CHAT SHOWCASE (Desktop Split-View & Icebreakers) -- */}
        {(activeTab === 'all' || activeTab === 'chat') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">💬</span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Premium Split-View Chat Experience
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Master-Detail 2-column layout on desktop, 1-click builder icebreakers, auto-linking, and grouped message bubbles with delivery status receipts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ Split-View Active
                </span>
              </div>
            </div>

            {/* Interactive Split View Preview Simulation */}
            <div className="mt-8 rounded-2xl border border-slate-200/90 overflow-hidden shadow-lg flex flex-col lg:flex-row h-[560px] bg-slate-50">
              {/* Left Sidebar Mock */}
              <div className="w-full lg:w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-extrabold text-sm text-slate-900">Messages (3)</h3>
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    ⚡ Priority Active
                  </span>
                </div>
                <div className="p-2 border-b border-slate-100">
                  <input
                    type="text"
                    placeholder="Search chats..."
                    className="w-full px-3 py-1.5 bg-slate-100 text-xs rounded-xl border border-slate-200 focus:outline-none"
                    readOnly
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <div className="p-2.5 rounded-xl bg-[#157A6E]/10 border border-[#157A6E]/30 flex items-center gap-3 cursor-pointer">
                    <Avatar src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200" name="Aarav Sharma" size={38} online />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-900 truncate">⚡ Aarav Sharma</span>
                        <span className="text-[10px] text-slate-400">10:16 AM</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate font-medium">Are you free for a quick 15-min...</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl hover:bg-slate-50 flex items-center gap-3 cursor-pointer opacity-70">
                    <Avatar src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200" name="Elena Rostova" size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-900 truncate">Elena Rostova</span>
                        <span className="text-[10px] text-slate-400">1h ago</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">Sent the WebGL benchmark repo</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Active Chat Mock */}
              <div className="flex-1 bg-white flex flex-col min-h-0">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-slate-100 bg-white/95 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200" name="Aarav Sharma" size={36} online />
                    <div>
                      <span className="font-extrabold text-xs text-slate-900 block">Aarav Sharma</span>
                      <span className="text-[10px] text-[#157A6E] font-bold">🎯 Looking for Co-Founder</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    ⏱ 18h left
                  </span>
                </div>

                {/* Message Canvas */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gradient-to-b from-slate-50/60 to-white">
                  {previewChatMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2 text-xs leading-relaxed rounded-2xl ${
                        m.isMe ? 'bg-[#157A6E] text-white rounded-br-xs' : 'bg-slate-100 text-slate-900 rounded-bl-xs'
                      }`}>
                        <p>{m.text}</p>
                        <div className={`flex items-center gap-1 mt-1 text-[9px] ${m.isMe ? 'text-teal-200 justify-end' : 'text-slate-400'}`}>
                          <span>{m.time}</span>
                          {m.isMe && <span>✓✓</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 1-Click Icebreaker Chips */}
                <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Icebreakers:</span>
                  {[
                    { label: '📅 15-min Intro', text: 'Thursday at 2 PM IST works great for me!' },
                    { label: '🚀 Tech Stack', text: 'We use Next.js 16, PyTorch, and Tailwind CSS.' },
                    { label: '📁 Share Deck', text: 'Here is our prototype demo link: https://buildyournetwork.online' },
                  ].map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setChatInputText(chip.text)}
                      className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:text-[#157A6E] hover:border-[#157A6E] whitespace-nowrap cursor-pointer shadow-2xs"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Interactive Message Input Box */}
                <div className="p-3 border-t border-slate-100 flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInputText}
                    onChange={e => setChatInputText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && chatInputText.trim()) {
                        setPreviewChatMessages(prev => [...prev, {
                          id: String(Date.now()),
                          text: chatInputText.trim(),
                          isMe: true,
                          time: 'Just now',
                        }]);
                        setChatInputText('');
                      }
                    }}
                    placeholder="Type a message or click an icebreaker above... (Enter to send)"
                    className="flex-1 px-3.5 py-2 bg-slate-50 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#157A6E]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (chatInputText.trim()) {
                        setPreviewChatMessages(prev => [...prev, {
                          id: String(Date.now()),
                          text: chatInputText.trim(),
                          isMe: true,
                          time: 'Just now',
                        }]);
                        setChatInputText('');
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-[#157A6E] text-white font-bold text-xs hover:bg-[#0D5F58] cursor-pointer"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* -- 4. NOTIFICATION & RETENTION CARDS LAB --------------------------- */}
        {(activeTab === 'all' || activeTab === 'notifications') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔔</span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    High-Intent Notification & Retention Copy Lab
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Builder-centric push alerts, match urgency reminders, and daily retention cards with 100% valid Next.js route actions.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-[#157A6E] border border-teal-200">
                ⚡ High-Conversion Copy
              </span>
            </div>

            {/* Notification Preview Cards Grid */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Card 1: Priority Message */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 border border-amber-300/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 px-3 py-0.5 bg-amber-500 text-white font-extrabold text-[10px] rounded-bl-xl uppercase tracking-wider">
                  ⚡ Priority Alert
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⚡</span>
                    <h3 className="font-extrabold text-sm text-slate-900">Priority Message from Aarav</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    &quot;Hey Sarah! Loved your work on distributed consensus algorithms. Are you free for a quick call this week?&quot;
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-700">Expires in 24h</span>
                  <Link
                    href="/chat"
                    className="px-3 py-1 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors shadow-2xs"
                  >
                    Reply Now →
                  </Link>
                </div>
              </div>

              {/* Card 2: 3 Founders Liked Profile */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/10 via-white to-teal-500/5 border border-teal-300/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 px-3 py-0.5 bg-[#157A6E] text-white font-extrabold text-[10px] rounded-bl-xl uppercase tracking-wider">
                  🎯 Mutual Intent
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🎯</span>
                    <h3 className="font-extrabold text-sm text-slate-900">3 Founders Liked Your Profile</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    High-alignment founders and engineers in Bengaluru reviewed your profile. Check mutual intents and connect.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-teal-200/60 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#157A6E]">High Alignment</span>
                  <Link
                    href="/likes"
                    className="px-3 py-1 rounded-xl bg-[#157A6E] text-white font-bold text-xs hover:bg-[#0D5F58] transition-colors shadow-2xs"
                  >
                    Review Builders →
                  </Link>
                </div>
              </div>

              {/* Card 3: Match Expiring Soon */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-500/10 via-white to-rose-500/5 border border-rose-300/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 px-3 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-bl-xl uppercase tracking-wider">
                  ⏱ Momentum Alert
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">⏱</span>
                    <h3 className="font-extrabold text-sm text-slate-900">Match with Elena Expires in 4h</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Keep your collaboration momentum alive. Drop a quick 1-click icebreaker to discuss WebGL benchmark details.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-700">4 Hours Left</span>
                  <Link
                    href="/chat"
                    className="px-3 py-1 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-colors shadow-2xs"
                  >
                    Send Quick Note →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* -- 3. CIRCLES POST & CONTEXT CHIP DEMO ----------------------------- */}
        {(activeTab === 'all' || activeTab === 'circles') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Circles Collaboration Post & Context Chips
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Intent-driven community posts with structured collaboration meta, live word-count verification, like counter, and contextual filtering pills.
              </p>
            </div>

            {/* Context Chips Filter Bar */}
            <div className="mt-6 mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                Interactive Context Filter Chips
              </span>
              <div className="flex flex-wrap gap-2">
                {CONTEXT_CHIPS_DEMO.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setActiveChip(chip)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      activeChip === chip
                        ? 'bg-[#157A6E] text-white shadow-xs border border-[#157A6E]'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200/60'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Circle Post Card Preview */}
            <div className="max-w-2xl mx-auto bg-slate-50/80 p-4 sm:p-6 rounded-2xl border border-slate-200">
              <CirclePostCard post={SAMPLE_CIRCLE_POST} />
            </div>
          </section>
        )}

        {/* -- 4. DESIGN TOKENS & TYPOGRAPHY SCALE ----------------------------- */}
        {(activeTab === 'all' || activeTab === 'tokens') && (
          <section className="mb-16 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-md">
            <div className="pb-6 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎨</span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Design Tokens & Typographic Hierarchy
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Strict WCAG AA compliant palette tokens and crisp typographic scale. Click any token card to copy its CSS variable value.
              </p>
            </div>

            {/* Copy Feedback Alert */}
            {copiedToken && (
              <div className="mt-4 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
                ✓ Copied <code className="bg-white px-1.5 py-0.5 rounded text-emerald-900">{copiedToken}</code> to clipboard!
              </div>
            )}

            {/* Primary Teal Tokens */}
            <div className="mt-8">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#157A6E]" />
                Primary Teal Palette (Brand & Authority)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {TEAL_TOKENS.map(tok => (
                  <button
                    key={tok.name}
                    onClick={() => copyToClipboard(tok.hex)}
                    className="p-4 rounded-2xl border border-slate-200 flex flex-col justify-between text-left transition-all hover:scale-102 hover:shadow-md cursor-pointer group relative overflow-hidden"
                    style={{ backgroundColor: tok.hex }}
                  >
                    <div className={tok.textClass}>
                      <span className="text-xs font-extrabold block font-mono">{tok.name}</span>
                      <span className="text-xs font-bold opacity-85 block">{tok.hex}</span>
                    </div>
                    <span className={`text-[11px] font-medium mt-6 block ${tok.textClass} opacity-90 leading-tight`}>
                      {tok.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accent Gold Tokens */}
            <div className="mt-8">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F4A259]" />
                Coral Gold Palette (Delight & High-Intent Accents)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {GOLD_TOKENS.map(tok => (
                  <button
                    key={tok.name}
                    onClick={() => copyToClipboard(tok.hex)}
                    className="p-4 rounded-2xl border border-slate-200 flex flex-col justify-between text-left transition-all hover:scale-102 hover:shadow-md cursor-pointer group relative overflow-hidden"
                    style={{ backgroundColor: tok.hex }}
                  >
                    <div className={tok.textClass}>
                      <span className="text-xs font-extrabold block font-mono">{tok.name}</span>
                      <span className="text-xs font-bold opacity-85 block">{tok.hex}</span>
                    </div>
                    <span className={`text-[11px] font-medium mt-6 block ${tok.textClass} opacity-90 leading-tight`}>
                      {tok.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Surface Tokens */}
            <div className="mt-8">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                Surface & Elevation Matrix
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {SURFACE_TOKENS.map(sur => (
                  <div
                    key={sur.name}
                    className="p-4 rounded-2xl border border-slate-200 flex items-center justify-between"
                    style={{ backgroundColor: sur.hex }}
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-800 block">{sur.name}</span>
                      <span className="text-[11px] text-slate-500">{sur.label}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-400">{sur.hex}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Typography Scale */}
            <div className="mt-10">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                Typography Scale
              </h3>
              <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                {TYPOGRAPHY_SCALE.map(t => (
                  <div
                    key={t.label}
                    className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="w-48 shrink-0">
                      <span className="text-xs font-extrabold text-[#157A6E] uppercase tracking-wider block">
                        {t.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {t.size} · {t.weight}
                      </span>
                    </div>
                    <div
                      className="text-slate-900 font-sans leading-tight overflow-hidden text-ellipsis"
                      style={{ fontSize: t.size, fontWeight: t.weight.split(' ')[0], letterSpacing: t.tracking }}
                    >
                      {t.sample}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </main>

      {/* -- Match Celebration Modal Instance ---------------------------------- */}
      <MatchModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        connectionId="preview-connection-123"
        myPhoto={null}
        myName="You"
        theirPhoto={null}
        theirName={(currentProfile.user as { name?: string })?.name ?? 'Aarav Sharma'}
      />
    </div>
    </ToastProvider>
  );
}
