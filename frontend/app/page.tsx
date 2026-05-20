"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Script from "next/script";
import Image from "next/image";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

type Stats = { users: number; connections: number } | null;

// ─── Navbar ──────────────────────────────────────────────────────────────────
function NavBar({ menuOpen, onToggle }: { menuOpen: boolean; onToggle: () => void }) {
  return (
    <nav
      id="main-nav"
      className="fixed top-0 left-0 right-0 z-[100] border-b border-[rgba(253,232,215,0.6)]"
      style={{ background: "rgba(255,244,236,0.92)", backdropFilter: "blur(20px)" }}
    >
      <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" className="font-extrabold text-xl text-[#0F766E] no-underline flex items-center gap-2 tracking-tight">
          <Image src="/assets/logo.png" alt="Build Your Network" width={28} height={28} className="rounded-[7px] logo-pulse" />
          BuildYourNetwork
        </a>

        {/* Desktop nav */}
        <div className="hidden min-[900px]:flex items-center gap-8">
          <a href="#trust" className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] transition-colors no-underline">Trust</a>
          <a href="#features" className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] transition-colors no-underline">Features</a>
          <a href="#how" className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] transition-colors no-underline">How It Works</a>
          <a href="/signup" className="bg-[#0F766E] text-white px-5 py-[10px] rounded-lg text-[13px] font-semibold hover:bg-[#0d5f58] hover:-translate-y-px transition-all no-underline">
            Open Web App
          </a>
          <a href="#download" className="border-2 border-[#0F766E] text-[#0F766E] px-5 py-[10px] rounded-lg text-[13px] font-semibold hover:bg-[#CCFBF1] transition-all no-underline">
            Download APK
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          onClick={onToggle}
          className="min-[900px]:hidden bg-transparent border-0 cursor-pointer p-2"
          aria-label="Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1F2937" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="min-[900px]:hidden flex flex-col px-6 pb-5 pt-4 gap-[18px] border-t border-[rgba(253,232,215,0.8)] z-[999]"
          style={{ background: "rgba(255,244,236,0.98)", backdropFilter: "blur(20px)", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
        >
          <a href="#trust" onClick={onToggle} className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] no-underline">Trust</a>
          <a href="#features" onClick={onToggle} className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] no-underline">Features</a>
          <a href="#how" onClick={onToggle} className="text-[#6B7280] text-sm font-medium hover:text-[#0F766E] no-underline">How It Works</a>
          <a href="/signup" className="bg-[#0F766E] text-white px-5 py-[10px] rounded-lg text-[13px] font-semibold text-center no-underline">Open Web App</a>
          <a href="#download" onClick={onToggle} className="border-2 border-[#0F766E] text-[#0F766E] px-5 py-[10px] rounded-lg text-[13px] font-semibold text-center no-underline">Download APK</a>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function HeroSection({ stats }: { stats: Stats }) {
  const [phoneHovered, setPhoneHovered] = useState(false);

  return (
    <section className="min-h-screen flex items-center px-6 pt-[120px] pb-[80px] bg-[#FFF4EC] relative overflow-hidden" id="hero">
      <div
        className="absolute pointer-events-none rounded-full opacity-50"
        style={{ top: "-20%", right: "-10%", width: 600, height: 600, background: "radial-gradient(circle, #CCFBF1 0%, transparent 70%)" }}
      />
      <div className="max-w-[1200px] mx-auto w-full grid min-[900px]:grid-cols-2 gap-12 min-[900px]:gap-[80px] items-center">

        {/* Left: content */}
        <div>
          <div className="flex gap-3 mb-8 flex-wrap" data-animate="">
            {[
              { icon: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>, label: "Works in browser" },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, label: "No install needed" },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, label: "Early Access" },
            ].map((b) => (
              <span key={b.label} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#FDE8D7] rounded-full text-xs font-medium text-[#6B7280]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">{b.icon}</svg>
                {b.label}
              </span>
            ))}
          </div>

          <h1
            className="font-extrabold leading-[1.1] tracking-[-1.5px] mb-6 text-[#1F2937]"
            style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
            data-animate=""
            data-delay="100"
          >
            Find <span className="text-[#0F766E]">Co-Founders, Mentors &amp; Collaborators</span> — Free
          </h1>

          <p className="text-lg text-[#6B7280] max-w-[480px] mb-10 leading-[1.7]" data-animate="" data-delay="200">
            The networking platform built for founders and entrepreneurs in India. Connect based on intent, skills, and goals — not job titles.
          </p>

          {stats && (
            <div className="flex gap-3 mb-6 flex-wrap" data-animate="" data-delay="200">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#FDE8D7] rounded-full text-xs font-medium text-[#6B7280]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {stats.users.toLocaleString()} professionals
              </span>
              {stats.connections > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#FDE8D7] rounded-full text-xs font-medium text-[#6B7280]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {stats.connections.toLocaleString()} connections made
                </span>
              )}
            </div>
          )}

          <div className="flex gap-4 items-center flex-wrap max-[600px]:flex-col max-[600px]:w-full" data-animate="" data-delay="300">
            <a
              href="/signup"
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#0F766E] text-white rounded-xl font-semibold text-[15px] transition-all hover:bg-[#0d5f58] hover:-translate-y-0.5 no-underline max-[600px]:w-full max-[600px]:justify-center"
              style={{ boxShadow: "0 4px 16px rgba(15,118,110,0.25)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Open Web App — Free
            </a>
            <a href="#how" className="inline-flex items-center gap-2 px-7 py-4 border-2 border-[#0F766E] text-[#0F766E] rounded-xl font-semibold text-[15px] transition-all hover:bg-[#CCFBF1] hover:-translate-y-0.5 no-underline max-[600px]:w-full max-[600px]:justify-center">
              See how it works
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
            </a>
          </div>
        </div>

        {/* Right: phone mockup */}
        <div className="flex justify-center -order-1 min-[900px]:order-none" data-animate="" data-delay="200">
          <div
            className="w-[240px] h-[480px] min-[900px]:w-[280px] min-[900px]:h-[560px] bg-white rounded-[36px] relative overflow-hidden transition-transform duration-[400ms]"
            style={{
              boxShadow: "0 12px 40px rgba(31,41,55,0.1), 0 0 0 12px #FDE8D7",
              transform: phoneHovered ? "rotate(0deg) scale(1.02)" : "rotate(-3deg)",
            }}
            onMouseEnter={() => setPhoneHovered(true)}
            onMouseLeave={() => setPhoneHovered(false)}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-7 bg-[#1F2937] rounded-b-2xl z-10" />
            <div className="px-5 pt-12 pb-5 h-full overflow-y-auto">
              <div className="flex justify-between items-center mb-5">
                <span className="font-bold text-xl text-[#1F2937]">Discover</span>
                <span className="px-3.5 py-1.5 bg-[#CCFBF1] rounded-full text-[11px] font-semibold text-[#0F766E]">Intent: Founder</span>
              </div>
              {[
                { initials: "SK", name: "Sarah Kim", role: "Building a climate tech startup", intent: "Looking for: Co-founder", score: 94 },
                { initials: "JM", name: "James Miller", role: "Product lead at Series B fintech", intent: "Looking for: Advisors", score: 88 },
                { initials: "AL", name: "Aisha Lopez", role: "Ex-Google PM, now indie hacker", intent: "Looking for: Beta testers", score: 91 },
              ].map((p) => (
                <div key={p.initials} className="bg-[#FFF4EC] rounded-2xl p-4 mb-3 flex gap-3 items-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ background: "linear-gradient(135deg, #14B8A6, #0F766E)" }}
                  >
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold mb-0.5 text-[#1F2937]">{p.name}</h4>
                    <p className="text-[11px] text-[#6B7280]">{p.role}</p>
                    <span className="inline-block mt-1 px-2.5 py-[3px] bg-[#CCFBF1] text-[#0F766E] rounded-xl text-[10px] font-semibold">{p.intent}</span>
                  </div>
                  <div className="text-center shrink-0">
                    <div className="text-lg font-extrabold text-[#0F766E]">{p.score}</div>
                    <div className="text-[9px] text-[#9CA3AF] uppercase tracking-wide">Trust</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust ───────────────────────────────────────────────────────────────────
const TRUST_CARDS = [
  {
    icon: <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>,
    title: "No Spam",
    body: "No bulk messages. No random outreach. Only intentional, relevant connection requests.",
  },
  {
    icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></>,
    title: "No Ads",
    body: "Zero advertising. Your attention is not our product. We don't sell impressions.",
  },
  {
    icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
    title: "No Data Selling",
    body: "Your profile data stays yours. We never share, sell, or monetize your personal information.",
  },
  {
    icon: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
    title: "Early Access",
    body: "This is a live, working product in active development. Your feedback shapes what comes next.",
  },
];

function TrustSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FDE8D7]" id="trust">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">Trust &amp; Transparency</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          Safe to install. Built for serious users.
        </h2>
        <p className="text-[17px] text-[#6B7280] max-w-[600px] leading-[1.7]" data-animate="" data-delay="200">
          We believe trust is earned, not claimed. Here&apos;s exactly what you get — and what you don&apos;t.
        </p>
        <div className="mt-12 grid grid-cols-2 max-[600px]:grid-cols-1 min-[900px]:grid-cols-4 gap-6">
          {TRUST_CARDS.map((c, i) => (
            <div
              key={c.title}
              className="bg-white px-6 py-8 rounded-2xl text-center border border-[rgba(253,232,215,0.5)] transition-all hover:-translate-y-1"
              style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }}
              data-animate=""
              data-delay={String(i * 100)}
            >
              <div className="w-12 h-12 bg-[#CCFBF1] rounded-[14px] flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" className="w-6 h-6">{c.icon}</svg>
              </div>
              <h3 className="text-base font-bold mb-2 text-[#1F2937]">{c.title}</h3>
              <p className="text-[13px] text-[#6B7280] leading-[1.6]">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────
const FEATURES = [
  { n: 1, title: "Discover by Intent", body: "See people who are actively looking for the same things you are — co-founders, mentors, collaborators, or peers." },
  { n: 2, title: "Filter by Goals", body: "Narrow your search by industry, role, stage, or specific intent. No noise, only relevance." },
  { n: 3, title: "Build Meaningful Connections", body: "Every interaction is grounded in shared purpose. Start conversations that actually matter." },
];

function FeaturesSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FFF4EC]" id="features">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">What It Does</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          Connect with intent. Find relevant people.
        </h2>
        <p className="text-[17px] text-[#6B7280] max-w-[600px] leading-[1.7]" data-animate="" data-delay="200">
          BuildYourNetwork replaces random networking with purposeful discovery. Every connection starts with a clear reason.
        </p>
        <div className="mt-14 grid grid-cols-1 min-[900px]:grid-cols-3 gap-8">
          {FEATURES.map((f, i) => (
            <div
              key={f.n}
              className="bg-white p-10 rounded-[20px] border border-[rgba(253,232,215,0.4)] transition-all hover:-translate-y-1.5"
              style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }}
              data-animate=""
              data-delay={String(i * 100)}
            >
              <div className="w-10 h-10 bg-[#0F766E] text-white rounded-xl flex items-center justify-center font-bold text-base mb-5">{f.n}</div>
              <h3 className="text-xl font-bold mb-3 text-[#1F2937]">{f.title}</h3>
              <p className="text-[15px] text-[#6B7280] leading-[1.7]">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, title: "Define Your Intent", body: "Tell the platform what you're looking for — a co-founder, advisor, collaborator, or peer. Be specific. The clearer your intent, the better your matches." },
  { n: 2, title: "Discover Relevant People", body: "Browse profiles filtered by your goals. See trust scores, background context, and exactly what each person is looking for." },
  { n: 3, title: "Start a Connection", body: "Send a purposeful connection request. When accepted, start a focused conversation built on mutual intent." },
];

function HowItWorksSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FDE8D7]" id="how">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">How It Works</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          Three steps to the right connection.
        </h2>
        <p className="text-[17px] text-[#6B7280] max-w-[600px] leading-[1.7]" data-animate="" data-delay="200">
          No complex onboarding. No endless scrolling. Just clarity, relevance, and action.
        </p>
        <div className="mt-14 grid grid-cols-1 min-[900px]:grid-cols-3 gap-10 relative">
          {/* Connector line — desktop only */}
          <div
            className="hidden min-[900px]:block absolute top-10 left-[16.66%] right-[16.66%] h-0.5 opacity-20"
            style={{ background: "linear-gradient(to right, #0F766E, #14B8A6)" }}
          />
          {STEPS.map((s, i) => (
            <div key={s.n} className="text-center relative z-10" data-animate="" data-delay={String(i * 100)}>
              <div
                className="w-20 h-20 bg-white border-[3px] border-[#0F766E] rounded-full flex items-center justify-center text-[28px] font-extrabold text-[#0F766E] mx-auto mb-6"
                style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }}
              >
                {s.n}
              </div>
              <h3 className="text-xl font-bold mb-3 text-[#1F2937]">{s.title}</h3>
              <p className="text-[15px] text-[#6B7280] leading-[1.7]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── App Preview ─────────────────────────────────────────────────────────────
function MiniPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[240px] mx-auto bg-[#1F2937] rounded-3xl p-3 pb-4" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
      <div className="bg-[#FFF4EC] rounded-2xl p-4 min-h-[320px]">{children}</div>
    </div>
  );
}

function MiniDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 bg-[#9CA3AF] rounded-full" />)}
    </div>
  );
}

function AppPreviewSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FFF4EC]" id="preview">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">App Preview</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          Built for clarity. Designed for trust.
        </h2>
        <p className="text-[17px] text-[#6B7280] max-w-[600px] leading-[1.7]" data-animate="" data-delay="200">
          Every screen is designed to reduce friction and build confidence — from discovery to your first message.
        </p>
        <div className="mt-14 grid grid-cols-1 min-[900px]:grid-cols-3 gap-8">

          {/* Discover */}
          <div className="bg-white rounded-3xl p-6 border border-[rgba(253,232,215,0.4)] transition-all hover:-translate-y-2" style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }} data-animate="">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-[#0F766E] mb-4 text-center">Discover Screen</p>
            <MiniPhone>
              <div className="flex justify-between items-center mb-4"><h4 className="text-sm font-bold text-[#1F2937]">Discover</h4><MiniDots /></div>
              {[
                { n: "MC", name: "Marcus Chen", role: "AI researcher · Looking for: PM" },
                { n: "ER", name: "Elena Rossi", role: "Designer · Looking for: Dev" },
                { n: "DP", name: "David Park", role: "Founder · Looking for: Advisor" },
              ].map((p) => (
                <div key={p.n} className="bg-white rounded-xl p-3 mb-2.5 flex gap-2.5 items-center">
                  <div className="w-9 h-9 rounded-full shrink-0" style={{ background: "linear-gradient(135deg, #14B8A6, #0F766E)" }} />
                  <div><h5 className="text-xs font-semibold text-[#1F2937]">{p.name}</h5><p className="text-[10px] text-[#6B7280]">{p.role}</p></div>
                </div>
              ))}
            </MiniPhone>
          </div>

          {/* Profile */}
          <div className="bg-white rounded-3xl p-6 border border-[rgba(253,232,215,0.4)] transition-all hover:-translate-y-2" style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }} data-animate="" data-delay="100">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-[#0F766E] mb-4 text-center">Profile Screen</p>
            <MiniPhone>
              <div className="flex justify-between items-center mb-4"><h4 className="text-sm font-bold text-[#1F2937]">Profile</h4><MiniDots /></div>
              <div className="text-center py-5">
                <div className="w-16 h-16 rounded-full mx-auto mb-3" style={{ background: "linear-gradient(135deg, #14B8A6, #0F766E)" }} />
                <h4 className="text-base font-bold mb-1 text-[#1F2937]">Alex Morgan</h4>
                <p className="text-xs text-[#6B7280]">Building in fintech · Series A</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[{ n: "96", l: "Trust" }, { n: "12", l: "Connections" }, { n: "3", l: "Intents" }].map((s) => (
                  <div key={s.l} className="bg-white p-2.5 rounded-xl text-center">
                    <div className="text-base font-extrabold text-[#0F766E]">{s.n}</div>
                    <div className="text-[9px] text-[#9CA3AF] uppercase">{s.l}</div>
                  </div>
                ))}
              </div>
            </MiniPhone>
          </div>

          {/* Chat */}
          <div className="bg-white rounded-3xl p-6 border border-[rgba(253,232,215,0.4)] transition-all hover:-translate-y-2" style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }} data-animate="" data-delay="200">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-[#0F766E] mb-4 text-center">Chat Screen</p>
            <MiniPhone>
              <div className="flex justify-between items-center mb-4"><h4 className="text-sm font-bold text-[#1F2937]">Alex Morgan</h4><MiniDots /></div>
              <div className="flex flex-col gap-2.5">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white border border-[#FDE8D7] text-[#1F2937] text-xs max-w-[80%] self-start leading-relaxed">
                  Hi! I saw you&apos;re looking for a technical co-founder. I&apos;m building something similar in the climate space.
                </div>
                <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-[#0F766E] text-white text-xs max-w-[80%] self-end leading-relaxed">
                  Hey Alex — yes, exactly. Would love to hear more about your background.
                </div>
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white border border-[#FDE8D7] text-[#1F2937] text-xs max-w-[80%] self-start leading-relaxed">
                  Sure. Ex-Stripe engineer, 6 years in infra. Looking for someone with GTM experience.
                </div>
              </div>
            </MiniPhone>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Differentiation ─────────────────────────────────────────────────────────
const DIFF_CARDS = [
  {
    icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
    title: "Intent-Based Discovery",
    body: "Traditional networks show you who people are. We show you what they want. You discover based on shared purpose, not shared connections.",
  },
  {
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    title: "Trust Score",
    body: "Every profile carries a transparent trust score based on verification depth, connection quality, and community feedback. No guesswork.",
  },
  {
    icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    title: "Relevance Over Volume",
    body: "We optimize for quality of connection, not quantity. A single relevant conversation is worth more than a hundred random contacts.",
  },
];

function DifferentiationSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FDE8D7]" id="differentiation">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">Why This Is Different</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          A new category of networking.
        </h2>
        <p className="text-[17px] text-[#6B7280] max-w-[600px] leading-[1.7]" data-animate="" data-delay="200">
          We didn&apos;t improve existing networking. We rebuilt it from first principles — starting with intent, not identity.
        </p>
        <div className="mt-14 grid grid-cols-1 min-[900px]:grid-cols-3 gap-8">
          {DIFF_CARDS.map((c, i) => (
            <div
              key={c.title}
              className="bg-white p-10 rounded-[20px] border border-[rgba(253,232,215,0.4)] relative overflow-hidden transition-all hover:-translate-y-1.5"
              style={{ boxShadow: "0 4px 24px rgba(31,41,55,0.06)" }}
              data-animate=""
              data-delay={String(i * 100)}
            >
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "linear-gradient(to right, #0F766E, #14B8A6)" }} />
              <div className="w-[52px] h-[52px] bg-[#CCFBF1] rounded-2xl flex items-center justify-center mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" className="w-[26px] h-[26px]">{c.icon}</svg>
              </div>
              <h3 className="text-xl font-bold mb-3 text-[#1F2937]">{c.title}</h3>
              <p className="text-[15px] text-[#6B7280] leading-[1.7]">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Coming Soon ─────────────────────────────────────────────────────────────
function ComingSoonSection() {
  return (
    <section className="py-[100px] px-6 bg-[#FFF4EC]" id="coming-soon">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">On The Horizon</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          What&apos;s Next
        </h2>
        <div
          className="mt-12 bg-[#f8f9fa] border-2 border-dashed border-[#9CA3AF] rounded-[20px] px-8 py-12 text-center cursor-default opacity-85"
          onClick={() => alert("Launching soon")}
          data-animate=""
          data-delay="200"
        >
          <span className="inline-block px-4 py-1.5 bg-[#9CA3AF] text-white rounded-full text-[11px] font-bold uppercase tracking-wide mb-4">Coming Soon</span>
          <h3 className="text-[22px] font-bold text-[#6B7280] mb-2">Intent Circles</h3>
          <p className="text-[15px] text-[#9CA3AF]">Join focused circles based on intent — launching soon.</p>
        </div>
      </div>
    </section>
  );
}

// ─── Download / Get Started ───────────────────────────────────────────────────
function DownloadSection() {
  return (
    <section
      className="py-[100px] px-6 text-center"
      id="download"
      style={{ background: "linear-gradient(135deg, #0F766E, #0d5f58)" }}
    >
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#CCFBF1] mb-4" data-animate="">Get Started</p>
        <h2 className="font-extrabold tracking-[-1px] text-white mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          Start in seconds — no install required
        </h2>
        <p className="text-[17px] text-white/80 max-w-[600px] mx-auto leading-[1.7]" data-animate="" data-delay="200">
          The full BuildYourNetwork experience runs directly in your browser. Sign up and start discovering in under a minute.
        </p>
        <div
          className="mt-12 rounded-3xl px-6 py-8 min-[601px]:p-12 border border-white/15"
          style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" }}
          data-animate=""
          data-delay="300"
        >
          <a
            href="/signup"
            className="inline-flex items-center gap-3 px-10 py-5 bg-white text-[#0F766E] rounded-2xl font-bold text-[17px] transition-all hover:-translate-y-0.5 no-underline"
            style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Open Web App — Free
          </a>
          <div className="flex justify-center gap-8 mt-6 flex-wrap">
            {["Works on all devices", "No download needed", "Instant access"].map((m) => (
              <span key={m} className="text-[13px] text-white/70 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
                {m}
              </span>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-1 min-[900px]:grid-cols-3 gap-6 text-left">
            {[
              { n: 1, title: "Open in browser", body: "Click the button above. Works on Chrome, Safari, Firefox — desktop or mobile." },
              { n: 2, title: "Sign up free", body: "Create your account and set your networking intent. Takes under 60 seconds." },
              { n: 3, title: "Start discovering", body: "Browse relevant profiles, connect with intent, and have real conversations." },
            ].map((s) => (
              <div key={s.n} className="p-6 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="w-9 h-9 bg-[#F4A261] text-white rounded-[10px] flex items-center justify-center font-bold text-base mb-3">{s.n}</div>
                <h4 className="text-[15px] font-semibold text-white mb-1.5">{s.title}</h4>
                <p className="text-[13px] text-white/70 leading-[1.6]">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-7 border-t border-white/15 text-center">
            <p className="text-[13px] text-white/60 mb-3.5">Prefer the native app? Android APK also available.</p>
            <a
              href="/download/android"
              className="inline-flex items-center gap-2 text-white/75 text-[13px] font-semibold border border-white/25 rounded-lg px-5 py-2.5 transition-colors hover:text-white hover:border-white/50 no-underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Android APK (v1.0.2)
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── About BYN ───────────────────────────────────────────────────────────────
const SEO_LINKS = [
  { href: "/networking-for-founders", label: "Networking for Founders" },
  { href: "/linkedin-alternative", label: "BYN vs LinkedIn" },
  { href: "/networking-for-entrepreneurs", label: "For Entrepreneurs" },
  { href: "/networking-for-creators", label: "For Creators" },
  { href: "/networking-for-freelancers", label: "For Freelancers" },
  { href: "/startup-community-india", label: "Startup Community India" },
  { href: "/business-networking-app", label: "Business Networking App" },
  { href: "/networking-for-investors", label: "For Investors" },
];

function AboutBYNSection() {
  return (
    <section className="py-[80px] px-6 bg-[#FDE8D7]" id="about-byn">
      <div className="max-w-[1100px] mx-auto">
        <p className="text-xs font-bold uppercase tracking-[2px] text-[#0F766E] mb-4" data-animate="">Knowledge Base</p>
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5 leading-[1.2]" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="" data-delay="100">
          What is Build Your Network?
        </h2>
        <div className="max-w-[760px] mx-auto">
          <p className="text-[17px] text-[#6B7280] leading-[1.75] mb-5" data-animate="" data-delay="200">
            <strong className="text-[#1F2937]">Build Your Network (BYN)</strong> is a free professional networking platform for founders, entrepreneurs, and creators in India. It connects you with co-founders, mentors, investors, and collaborators based on your goals and stated intent — not job titles or follower counts.
          </p>
          <p className="text-base text-[#6B7280] leading-[1.75] mb-5" data-animate="" data-delay="200">
            Every user on BYN declares what they are actively looking for — a co-founder, a technical partner, a mentor, an investor, or a collaborator. This intent-first approach means every discovery result is someone actively seeking the same kind of relationship. No recruiter spam. No feed noise. Just relevant connections.
          </p>
          <p className="text-base text-[#6B7280] leading-[1.75] mb-9" data-animate="" data-delay="300">
            BYN uses GPS-based location matching — discover founders within 10 km for in-person collaboration or search nationwide for remote co-founders. It runs entirely in your browser. No app install required. Available across India: Hyderabad, Bengaluru, Mumbai, Delhi, Pune, Chennai, and every other city.
          </p>
          <div className="flex flex-wrap gap-2.5" data-animate="" data-delay="300">
            {SEO_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-[#0F766E] font-semibold text-[13px] no-underline inline-flex items-center bg-white px-3 py-1.5 rounded-lg border border-[rgba(15,118,110,0.15)] hover:bg-[#CCFBF1] transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: "What is Build Your Network?", a: "Build Your Network (BYN) is a free professional networking platform for founders, entrepreneurs, and creators in India. It connects you with co-founders, mentors, investors, and collaborators based on your goals and stated intent — not job titles or work history. BYN uses GPS-based location matching and runs entirely in your browser — no install required." },
  { q: "How is Build Your Network different from LinkedIn?", a: "LinkedIn is built for job-seekers and recruiters. Build Your Network is built for founders and entrepreneurs who want co-founders, mentors, advisors, and investors — matched by intent and skills. On BYN: no recruiter spam, no feed noise, no vanity metrics. Every person you see has declared what they are actively looking for, making first messages contextual and response rates far higher." },
  { q: "How do I find a co-founder on Build Your Network?", a: 'Create a free profile, set your intent to "Looking for Co-founder", add your skills and startup description, and enable location discovery. BYN surfaces founders with complementary skills within your chosen radius. You can filter by city (Hyderabad, Bengaluru, Mumbai, etc.) or search Remote/Worldwide for technical co-founders anywhere in India.' },
  { q: "Is Build Your Network free?", a: "Yes — BYN is free with 30 daily connection requests. No install, no credit card. Premium plans unlock unlimited connections, priority discovery, exact location filters (10/25/50 km), and profile boosting for founders who want faster results." },
  { q: "Is Build Your Network available across India?", a: "Yes. Build Your Network supports founders and entrepreneurs in every major Indian city — Hyderabad, Bengaluru, Mumbai, Delhi, Pune, Chennai, Kolkata, Ahmedabad, Jaipur, and more. GPS-based filters let you discover connections within 10 km, 50 km, 200 km, or search nationwide and worldwide." },
  { q: "Who uses Build Your Network?", a: "Build Your Network is used by startup founders, solo entrepreneurs, freelancers, creators, product managers, designers, developers, angel investors, and mentors — anyone who wants meaningful professional connections based on intent and goals." },
  { q: "How does the location filter work?", a: "BYN uses GPS to show you professionals within 200 km by default. Premium users can tighten that to 10, 25, or 50 km for hyper-local co-founder discovery. You can also set Remote-only or Worldwide to find collaborators anywhere without location constraints." },
  { q: "Is my data safe on Build Your Network?", a: "Yes. Your email is never shared with other users. Exact GPS coordinates are only used to compute distance — never exposed to other profiles. All data is stored securely on Supabase with Row-Level Security policies enforced. BYN has no ads and does not sell user data." },
];

function FAQSection() {
  return (
    <section className="py-[80px] px-6 bg-white" id="faq">
      <div className="max-w-[1100px] mx-auto">
        <h2 className="font-extrabold text-[#1F2937] text-center mb-2" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }} data-animate="">
          Frequently Asked Questions
        </h2>
        <p className="text-center text-[#6B7280] mb-12" data-animate="" data-delay="100">
          Everything you need to know about Build Your Network
        </p>
        <div className="max-w-[720px] mx-auto">
          {FAQS.map((f, i) => (
            <details key={i} className="border-b border-[#FDE8D7] group" data-animate="" data-delay={String(i * 50)}>
              <summary className="cursor-pointer py-5 text-base font-semibold text-[#1F2937] flex justify-between items-center gap-4 [list-style:none] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-[22px] text-[#0F766E] shrink-0 transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <div className="pb-5">
                <p className="text-[#6B7280] leading-[1.7] text-[15px]">{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTASection() {
  return (
    <section className="text-center py-[120px] px-6 bg-[#FFF4EC]">
      <div className="max-w-[1100px] mx-auto">
        <h2 className="font-extrabold tracking-[-1px] text-[#1F2937] mb-5" style={{ fontSize: "clamp(32px, 4vw, 48px)" }} data-animate="">
          Your network defines your trajectory.
        </h2>
        <p className="text-lg text-[#6B7280] mb-10" data-animate="" data-delay="100">
          Stop collecting contacts. Start building connections that matter.
        </p>
        <div data-animate="" data-delay="200">
          <a
            href="/signup"
            className="inline-flex items-center gap-2.5 px-10 py-[18px] bg-[#0F766E] text-white rounded-xl font-semibold text-[17px] transition-all hover:bg-[#0d5f58] hover:-translate-y-0.5 no-underline"
            style={{ boxShadow: "0 4px 16px rgba(15,118,110,0.25)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[22px] h-[22px]">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Open Web App — Free
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function FooterSection() {
  return (
    <footer className="bg-[#1F2937] text-white pt-[60px] px-6 pb-10">
      <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[600px]:grid-cols-1 min-[900px]:grid-cols-[2fr_1fr_1fr_1fr] gap-12">
        <div>
          <div className="text-xl font-extrabold text-[#CCFBF1] mb-3 flex items-center gap-2">
            <Image src="/assets/logo.png" alt="Build Your Network" width={26} height={26} className="rounded-[6px]" />
            BuildYourNetwork
          </div>
          <p className="text-sm text-[#9CA3AF] leading-[1.7]">
            An intent-based networking platform for professionals who value relevance over volume.
          </p>
        </div>
        <div>
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-5">Legal</h4>
          <a href="/privacy" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">Privacy Policy</a>
          <a href="/terms" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">Terms of Service</a>
        </div>
        <div>
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-5">Product</h4>
          <a href="#features" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">Features</a>
          <a href="#how" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">How It Works</a>
          <a href="#faq" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">FAQ</a>
          <a href="/signup" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">Open Web App</a>
        </div>
        <div>
          <h4 className="text-[13px] font-bold uppercase tracking-wide text-[#9CA3AF] mb-5">Support</h4>
          <a href="mailto:support@buildyournetwork.online" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">support@buildyournetwork.online</a>
          <a href="/download/android" className="block text-white/70 text-sm mb-3 hover:text-white transition-colors no-underline">Download APK</a>
        </div>
      </div>
      <div className="max-w-[1100px] mx-auto mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 text-[13px] text-[#9CA3AF] text-center">
        <span>&copy; 2026 BuildYourNetwork. All rights reserved.</span>
        <span>Early Access Product</span>
      </div>
    </footer>
  );
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────
function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    setSubmitted(false);
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-[rgba(31,41,55,0.4)] z-[200]" style={{ backdropFilter: "blur(8px)" }} onClick={handleClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] bg-white rounded-[20px] z-[201] overflow-hidden mx-4"
        style={{ boxShadow: "0 24px 64px rgba(31,41,55,0.2)" }}
      >
        <div className="flex justify-between items-center px-7 pt-6">
          <h3 className="text-xl font-bold text-[#1F2937]">Share Your Thoughts</h3>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[#9CA3AF] hover:bg-[#FFF4EC] hover:text-[#1F2937] transition-colors border-0 bg-transparent cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-7 pb-7 pt-5">
          {submitted ? (
            <div className="text-center py-5">
              <div className="w-16 h-16 bg-[#CCFBF1] rounded-full flex items-center justify-center mx-auto mb-4 text-[#0F766E]">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h4 className="text-lg font-bold mb-2 text-[#1F2937]">Thank You</h4>
              <p className="text-sm text-[#6B7280] mb-6 leading-[1.6]">Your feedback has been received. We review every submission personally.</p>
              <button onClick={handleClose} className="px-8 py-3 bg-[#FFF4EC] text-[#1F2937] border-[1.5px] border-[#FDE8D7] rounded-[10px] text-sm font-semibold cursor-pointer hover:bg-[#FDE8D7] transition-colors">
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
              <p className="text-sm text-[#6B7280] mb-5 leading-[1.6]">Help us improve BuildYourNetwork. Your feedback shapes the product.</p>
              <div className="mb-4">
                <label className="block text-[13px] font-semibold text-[#1F2937] mb-1.5">What is this about?</label>
                <select defaultValue="" required className="w-full px-3.5 py-3 border-[1.5px] border-[#FDE8D7] rounded-[10px] text-sm text-[#1F2937] bg-[#FFF4EC] focus:outline-none focus:border-[#0F766E]">
                  <option value="" disabled>Select a topic</option>
                  <option value="bug">Bug or issue</option>
                  <option value="feature">Feature request</option>
                  <option value="ux">User experience</option>
                  <option value="install">Installation problem</option>
                  <option value="other">Something else</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-[13px] font-semibold text-[#1F2937] mb-1.5">Your feedback</label>
                <textarea rows={5} required placeholder="Describe what you experienced, what you expected, and what happened instead..." className="w-full px-3.5 py-3 border-[1.5px] border-[#FDE8D7] rounded-[10px] text-sm text-[#1F2937] bg-[#FFF4EC] focus:outline-none focus:border-[#0F766E] resize-y" />
              </div>
              <div className="mb-5">
                <label className="block text-[13px] font-semibold text-[#1F2937] mb-1.5">Email (optional)</label>
                <input type="email" placeholder="you@example.com" className="w-full px-3.5 py-3 border-[1.5px] border-[#FDE8D7] rounded-[10px] text-sm text-[#1F2937] bg-[#FFF4EC] focus:outline-none focus:border-[#0F766E]" />
                <span className="block text-[12px] text-[#9CA3AF] mt-1">Only if you&apos;d like us to follow up</span>
              </div>
              <button type="submit" className="w-full py-3.5 bg-[#0F766E] text-white border-0 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#0d5f58] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send Feedback
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<Stats>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!loading && user?.email_verified && user.onboarding_stage === "complete") {
      router.replace("/discover");
    }
  }, [user, loading, router]);

  useEffect(() => {
    fetch("/api/stats/public")
      .then((r) => r.json())
      .then((d) => { if (d.users > 0) setStats(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll("[data-animate]").forEach((el) => {
      const h = el as HTMLElement;
      const delay = h.dataset.delay ?? "0";
      h.style.opacity = "0";
      h.style.transform = "translateY(24px)";
      h.style.transition = `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`;
      obs.observe(el);
    });

    const handleScroll = () => {
      const nav = document.getElementById("main-nav");
      if (nav) nav.style.boxShadow = window.scrollY > 50 ? "0 1px 20px rgba(0,0,0,0.05)" : "none";
      if (menuOpen) setMenuOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    const handleHashClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      const target = document.querySelector(href);
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); }
    };
    document.addEventListener("click", handleHashClick);

    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("click", handleHashClick);
    };
  }, [menuOpen]);

  return (
    <div className={inter.className} style={{ background: "#FFF4EC" }}>
      <NavBar menuOpen={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
      <HeroSection stats={stats} />
      <TrustSection />
      <FeaturesSection />
      <HowItWorksSection />
      <AppPreviewSection />
      <DifferentiationSection />
      <ComingSoonSection />
      <DownloadSection />
      <AboutBYNSection />
      <FAQSection />
      <FinalCTASection />
      <FooterSection />

      {/* Feedback tab */}
      <button
        onClick={() => setFeedbackOpen(true)}
        className="feedback-tab-mobile fixed right-0 top-1/2 -translate-y-1/2 translate-x-0.5 bg-[#0F766E] text-white py-3.5 px-2.5 rounded-l-xl cursor-pointer z-[99] flex flex-col items-center gap-1.5 border-0 transition-all hover:bg-[#0d5f58] hover:translate-x-0"
        style={{ boxShadow: "-4px 4px 20px rgba(15,118,110,0.3)", writingMode: "vertical-rl", textOrientation: "mixed" }}
        aria-label="Open feedback"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(-90deg)" }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ transform: "rotate(180deg)" }}>Feedback</span>
      </button>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <Script strategy="afterInteractive" src="https://www.googletagmanager.com/gtag/js?id=G-5NQDBYG4CJ" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-5NQDBYG4CJ');
      `}</Script>
    </div>
  );
}
