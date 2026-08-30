/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import LandingClient from '@/components/landing/LandingClient';
import MobileNav from '@/components/landing/MobileNav';
import FeedbackWidget from '@/components/landing/FeedbackWidget';
import DiscoverPreview from '@/components/landing/DiscoverPreview';
import ProfilePreview from '@/components/landing/ProfilePreview';
import MatchPreview from '@/components/landing/MatchPreview';
import ConversationPreview from '@/components/landing/ConversationPreview';
import CirclePreview from '@/components/landing/CirclePreviewClient';
import { ToastProvider } from '@/components/ui/Toast';
// Real product-screen chrome (SwipeCard, ProfileView, CirclePostCard all
// share these classes) — imported here, once, for the whole homepage.
import './(app)/app.css';

export const metadata: Metadata = {
  alternates: { canonical: 'https://buildyournetwork.online' },
};

// Homepage-only layout/section styling. Design tokens (--primary, --accent,
// shadows, radii) come from the single source of truth in app/globals.css —
// this file no longer redefines its own copy of the palette.
const LANDING_CSS = `
  html, body { color-scheme: light !important; background-color: #F6F8FA !important; }
  html { scroll-behavior: smooth; }
  body { font-family: var(--font-sans); }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
  .animate { opacity: 0; animation: fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
  .delay-1 { animation-delay: 0.1s; }
  .delay-2 { animation-delay: 0.2s; }
  .delay-3 { animation-delay: 0.3s; }
  @keyframes logoPulse { 0% { box-shadow: 0 0 0 0 var(--primary-glow); } 70% { box-shadow: 0 0 0 7px rgba(21,122,110,0); } 100% { box-shadow: 0 0 0 0 rgba(21,122,110,0); } }
  .logo-img { width:28px; height:28px; border-radius:7px; flex-shrink:0; animation:logoPulse 2.4s ease-in-out infinite; }
  .logo-img-footer { width:26px; height:26px; border-radius:6px; flex-shrink:0; }
  @media (prefers-reduced-motion: reduce) { .animate { animation: none; opacity: 1; } .logo-img { animation: none; } }

  .skip-link {
    position:absolute; top:-48px; left:8px; z-index:1000;
    background:var(--primary); color:white; padding:12px 20px;
    border-radius:8px; font-weight:600; font-size:14px; text-decoration:none;
    transition:top 0.2s;
  }
  .skip-link:focus { top:8px; }

  nav {
    position:fixed; top:0; left:0; right:0; z-index:100;
    background:rgba(246,248,250,0.92); backdrop-filter:blur(20px);
    border-bottom:1px solid var(--border-subtle);
  }
  .nav-inner { max-width:1200px; margin:0 auto; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; }
  .logo { font-weight:800; font-size:19px; color:var(--primary); letter-spacing:-0.5px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; }
  .nav-links { display:flex; gap:28px; align-items:center; }
  .nav-links a:not(.nav-cta):not(.nav-login) { text-decoration:none; color:var(--text-soft); font-weight:500; font-size:14px; transition:color 0.2s; }
  .nav-links a:not(.nav-cta):not(.nav-login):hover { color:var(--primary); }
  .nav-login { text-decoration:none; color:var(--text); font-weight:600; font-size:14px; }
  .nav-cta { background:var(--primary); color:white !important; padding:9px 18px; border-radius:8px; font-weight:600; font-size:13px; text-decoration:none; transition:all 0.2s; }
  .nav-cta:hover { background:var(--primary-dark); transform:translateY(-1px); }
  .mobile-menu-btn { display:none; background:none; border:none; cursor:pointer; padding:8px; }

  /* -- Hero — split-screen: left=marketing, right=discovery workspace -- */
  .hero { min-height:100vh; display:flex; align-items:stretch; position:relative; overflow:hidden; padding:0; }
  .hero-bg { position:absolute; top:-20%; left:-10%; width:700px; height:700px; background:radial-gradient(circle,var(--highlight) 0%,transparent 70%); opacity:0.45; pointer-events:none; z-index:0; }
  .hero-inner { width:100%; display:grid; grid-template-columns:1fr 1fr; align-items:stretch; position:relative; z-index:1; }
  .hero-content { display:flex; flex-direction:column; justify-content:center; padding:128px 56px 80px 64px; }
  .hero-content h1 { font-size:clamp(32px,4vw,52px); font-weight:800; line-height:1.1; letter-spacing:-1.5px; margin-bottom:18px; color:var(--text); }
  .hero-content h1 span { color:var(--primary); }
  .hero-content .subtitle { font-size:17px; color:var(--text-soft); max-width:440px; margin-bottom:32px; line-height:1.6; }
  .cta-group { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .btn-primary { display:inline-flex; align-items:center; gap:10px; padding:15px 28px; background:var(--primary); color:white; text-decoration:none; border-radius:12px; font-weight:600; font-size:15px; transition:all 0.2s cubic-bezier(0.22,1,0.36,1); border:none; cursor:pointer; box-shadow:var(--shadow-primary); }
  .btn-primary:hover { background:var(--primary-dark); transform:translateY(-2px); box-shadow:0 8px 24px rgba(21,122,110,0.35); }
  .btn-primary svg { width:19px; height:19px; }
  .btn-secondary { display:inline-flex; align-items:center; gap:8px; padding:15px 24px; background:transparent; color:var(--primary); text-decoration:none; border-radius:12px; font-weight:600; font-size:15px; border:2px solid var(--primary); transition:all 0.2s; }
  .btn-secondary:hover { background:var(--primary-light); transform:translateY(-2px); }
  /* Discovery workspace panel — same page background as the marketing
     column on purpose. This used to carry its own flat --bg-subtle fill
     plus a border-left, which read as a hard seam splitting the hero in
     half (worse under forced-dark rendering, where two very-close light
     grays invert into two visibly different darks). The glow is the only
     thing that should distinguish this half — no separate fill, no border. */
  .hero-visual { display:flex; align-items:center; justify-content:center; padding:64px 48px; position:relative; }
  .hero-visual::before { content:''; position:absolute; inset:0; background:radial-gradient(circle at 60% 40%, var(--highlight) 0%, transparent 65%); opacity:0.35; pointer-events:none; }

  section { padding:88px 24px; position:relative; }
  .section-inner { max-width:1080px; margin:0 auto; }
  .section-label { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1.6px; color:var(--primary); margin-bottom:14px; }
  .section-title { font-size:clamp(26px,3.2vw,38px); font-weight:800; letter-spacing:-1px; margin-bottom:16px; line-height:1.2; }
  .section-desc { font-size:16px; color:var(--text-soft); max-width:580px; line-height:1.65; text-wrap:balance; }
  .section-center { text-align:center; }
  .section-center .section-desc { margin-left:auto; margin-right:auto; }

  /* -- Why BYN -- */
  .why-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; margin-top:44px; }
  .why-card { background:var(--bg-elevated); padding:32px 26px; border-radius:20px; box-shadow:var(--shadow-sm); border:1px solid var(--border-subtle); position:relative; overflow:hidden; }
  .why-card::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(to right,var(--primary),var(--primary-2)); }
  .why-icon { width:46px; height:46px; background:var(--primary-light); border-radius:14px; display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
  .why-icon svg { width:23px; height:23px; color:var(--primary); }
  .why-card h3 { font-size:18px; font-weight:700; margin-bottom:8px; }
  .why-card p { font-size:14px; color:var(--text-soft); line-height:1.6; }

  /* -- Discovery / intent language -- */
  .intent-lang-row { display:flex; flex-wrap:wrap; gap:14px; margin-top:40px; }
  .intent-lang-card { flex:1; min-width:200px; background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:16px; padding:20px; box-shadow:var(--shadow-xs); }
  .intent-lang-label { display:inline-block; font-size:10px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; color:var(--primary); background:var(--primary-light); padding:4px 10px; border-radius:999px; margin-bottom:12px; }
  .intent-lang-value { font-size:15px; font-weight:700; color:var(--text); }

  /* -- Real product screens -- */
  .screens-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:28px; margin-top:44px; align-items:start; }
  .screen-slot { display:flex; flex-direction:column; align-items:center; gap:14px; }
  .screen-caption { font-size:13px; font-weight:700; color:var(--text-soft); text-align:center; }

  /* -- Trust -- */
  .trust-section { background:var(--bg-subtle); }
  .trust-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-top:40px; max-width:640px; }
  .trust-check { display:flex; align-items:flex-start; gap:12px; background:var(--bg-elevated); padding:18px 20px; border-radius:14px; border:1px solid var(--border-subtle); }
  .trust-check svg { width:20px; height:20px; color:var(--primary); flex-shrink:0; margin-top:1px; }
  .trust-check h3 { font-size:14px; font-weight:700; margin-bottom:3px; }
  .trust-check p { font-size:12.5px; color:var(--text-soft); line-height:1.5; }

  /* -- Circles -- */
  .circles-copy { max-width:560px; }
  .circles-layout { display:grid; grid-template-columns:1fr 1fr; gap:40px; align-items:center; margin-top:40px; }

  /* -- SEO content (About / FAQ) -- */
  .seo-section { background:var(--bg-subtle); }
  .seo-links { display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }
  .seo-links a { color:var(--primary); font-weight:600; font-size:13px; text-decoration:none; display:inline-flex; align-items:center; background:var(--bg-elevated); padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); }
  .faq-item { border-bottom:1px solid var(--border); }
  .faq-item summary { cursor:pointer; padding:20px 0; font-size:16px; font-weight:600; color:var(--text); list-style:none; display:flex; justify-content:space-between; align-items:center; gap:16px; user-select:none; }
  .faq-item summary::-webkit-details-marker { display:none; }
  .faq-item summary::after { content:'+'; font-size:22px; color:var(--primary); flex-shrink:0; transition:transform .25s; }
  .faq-item[open] summary::after { transform:rotate(45deg); }
  .faq-item div { padding:0 0 20px; }
  .faq-item div p { color:var(--text-soft); line-height:1.7; font-size:15px; }

  /* -- Download (real APK — public/apk/BuildYourNetwork.apk) -- */
  .download-section { background:linear-gradient(135deg,var(--primary),var(--primary-dark)); color:white; text-align:center; padding:72px 24px; }
  .download-section .section-label { color:var(--primary-light); }
  .download-section .section-title { color:white; }
  .download-section .section-desc { color:rgba(255,255,255,0.82); margin-left:auto; margin-right:auto; }
  .download-box { display:flex; flex-direction:column; align-items:center; gap:20px; margin-top:36px; }
  .download-btn { display:inline-flex; align-items:center; gap:10px; padding:16px 32px; background:white; color:var(--primary); text-decoration:none; border-radius:14px; font-weight:700; font-size:16px; transition:all 0.2s; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .download-btn:hover { transform:translateY(-2px); box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .download-meta { display:flex; justify-content:center; gap:24px; flex-wrap:wrap; }
  .download-meta span { font-size:12.5px; color:rgba(255,255,255,0.72); display:flex; align-items:center; gap:6px; }
  .download-meta svg { width:15px; height:15px; }

  .final-cta { text-align:center; padding:100px 24px; }
  .final-cta h2 { font-size:clamp(30px,3.8vw,44px); font-weight:800; letter-spacing:-1px; margin-bottom:16px; }
  .final-cta p { font-size:17px; color:var(--text-soft); margin-bottom:32px; }

  footer { background:var(--text); color:white; padding:56px 24px 36px; }
  .footer-inner { max-width:1080px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr; gap:44px; }
  .footer-brand { font-size:19px; font-weight:800; color:var(--primary-light); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
  .footer-desc { font-size:13.5px; color:rgba(255,255,255,0.55); line-height:1.7; }
  .footer-col h3 { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.45); margin-bottom:18px; }
  .footer-col a { display:block; color:rgba(255,255,255,0.72); text-decoration:none; font-size:13.5px; margin-bottom:11px; transition:color 0.2s; }
  .footer-col a:hover { color:white; }
  .footer-bottom { max-width:1080px; margin:36px auto 0; padding-top:22px; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; font-size:12.5px; color:rgba(255,255,255,0.45); }

  .feedback-tab { position:fixed; right:0; top:50%; transform:translateY(-50%) translateX(2px); background:var(--primary); color:white; padding:14px 10px 14px 14px; border-radius:12px 0 0 12px; cursor:pointer; z-index:99; display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; box-shadow:-4px 4px 20px rgba(21,122,110,0.3); transition:all 0.3s cubic-bezier(0.22,1,0.36,1); writing-mode:vertical-rl; text-orientation:mixed; line-height:1; border:none; }
  .feedback-tab svg { transform:rotate(-90deg); flex-shrink:0; }
  .feedback-tab:hover { transform:translateY(-50%) translateX(0); background:var(--primary-dark); box-shadow:-6px 6px 28px rgba(21,122,110,0.4); }
  .feedback-tab span { transform:rotate(180deg); }
  .feedback-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(8px); z-index:200; }
  .feedback-modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; max-width:480px; background:var(--card); border-radius:20px; box-shadow:var(--shadow-xl); z-index:201; overflow:hidden; margin:0 16px; }
  .feedback-header { display:flex; justify-content:space-between; align-items:center; padding:24px 28px 0; }
  .feedback-header h3 { font-size:20px; font-weight:700; color:var(--text); }
  .feedback-close { background:none; border:none; cursor:pointer; padding:6px; border-radius:8px; color:var(--text-muted); transition:all 0.2s; display:flex; align-items:center; justify-content:center; }
  .feedback-close:hover { background:var(--bg); color:var(--text); }
  .feedback-body { padding:20px 28px 28px; }
  .feedback-intro { font-size:14px; color:var(--text-soft); margin-bottom:20px; line-height:1.6; }
  .feedback-field { margin-bottom:18px; }
  .feedback-field label { display:block; font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px; }
  .feedback-field input, .feedback-field select, .feedback-field textarea { width:100%; padding:12px 14px; border:1.5px solid var(--border); border-radius:10px; font-family:inherit; font-size:14px; color:var(--text); background:var(--bg); transition:all 0.2s; outline:none; resize:vertical; }
  .feedback-field input:focus, .feedback-field select:focus, .feedback-field textarea:focus { border-color:var(--primary); background:var(--card); box-shadow:0 0 0 3px var(--primary-glow); }
  .feedback-submit { width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.25s; margin-top:8px; }
  .feedback-submit:hover { background:var(--primary-dark); transform:translateY(-1px); }
  .field-hint { display:block; font-size:12px; color:var(--text-muted); margin-top:4px; }
  .feedback-done { padding:12px 32px; background:var(--bg); color:var(--text); border:1.5px solid var(--border); border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .feedback-done:hover { background:var(--bg-subtle); }
  .success-icon { width:64px; height:64px; background:var(--primary-light); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; color:var(--primary); }

  @media (max-width:900px) {
    .hero-inner { grid-template-columns:1fr; align-items:start; }
    .hero-content { padding:100px 28px 40px; }
    .hero-visual { order:2; padding:28px 16px 48px; min-height:auto; }

    .why-grid { grid-template-columns:1fr; }
    .screens-grid { grid-template-columns:1fr; }
    .trust-grid { grid-template-columns:1fr; }
    .circles-layout { grid-template-columns:1fr; gap:28px; }
    .footer-inner { grid-template-columns:1fr 1fr; }
    .nav-links { display:none; }
    .nav-links.open { display:flex; flex-direction:column; align-items:flex-start; position:absolute; top:100%; left:0; right:0; background:rgba(246,248,250,0.98); backdrop-filter:blur(20px); border-top:1px solid var(--border-subtle); padding:16px 24px 20px; gap:16px; box-shadow:var(--shadow-md); z-index:999; }
    .mobile-menu-btn { display:block; }
  }
  @media (max-width:600px) {
    .footer-inner { grid-template-columns:1fr; }
    .footer-bottom { flex-direction:column; gap:12px; text-align:center; }
    .cta-group { flex-direction:column; width:100%; }
    .cta-group a, .cta-group button { width:100%; justify-content:center; }
    .intent-lang-row { flex-direction:column; }
    .feedback-tab { right:auto; left:50%; top:auto; bottom:var(--byn-cookie-banner-h, 0px); transform:translateX(-50%) translateY(2px); border-radius:12px 12px 0 0; padding:10px 20px; flex-direction:row; writing-mode:horizontal-tb; text-orientation:mixed; box-shadow:0 -4px 20px rgba(21,122,110,0.3); transition:bottom 0.25s ease; }
    .feedback-tab svg { transform:none; }
    .feedback-tab span { transform:none; }
    .feedback-tab:hover { transform:translateX(-50%) translateY(0); }
  }
`;

export default async function HomePage() {
  return (
    <ToastProvider>
    <div>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      <a href="#hero" className="skip-link">Skip to main content</a>

      {/* Auth redirect + scroll-reveal animations — renders null, client only */}
      <LandingClient />

      {/* Nav */}
      <nav>
        <div className="nav-inner">
          <a href="/" className="logo">
            <img src="/assets/logo.png" className="logo-img" alt="Build Your Network" width={28} height={28} fetchPriority="high" />
            Build Your Network
          </a>
          <MobileNav />
        </div>
      </nav>

      {/* -- HERO — the real Discover card IS the product demo, not a mockup of it -- */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-inner">
          <div className="hero-content">
            {/* Hero badges ("Works in browser · No install needed · N professionals")
                removed intentionally — implementation reassurance and a live user
                count aren't the hero's primary value proposition. The hero sells
                the networking outcome; let it breathe. */}
            <h1 className="animate delay-1">Meet people by <span>intent</span>, not by resume.</h1>
            <p className="subtitle animate delay-2">Find who&apos;s actively looking for what you offer — and the people you&apos;re looking for. Build Your Network matches on declared intent, not job titles.</p>
            <div className="cta-group animate delay-3">
              <a href="/signup" className="btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="18" y2="12" /><polyline points="12.5 6 18 12 12.5 18" /></svg>Start networking free</a>
              <a href="#screens" className="btn-secondary">See how it works<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg></a>
            </div>
          </div>
          {/* The real Discover card component — same file that renders in the live app */}
          <div className="hero-visual animate delay-2">
            <DiscoverPreview />
          </div>
        </div>
      </section>

      {/* -- WHY BYN -- */}
      <section id="why">
        <div className="section-inner">
          <p className="section-label animate">Why This Is Different</p>
          <h2 className="section-title animate delay-1">Context before connection.</h2>
          <p className="section-desc animate delay-2">Most networks show you who people are. BYN shows you what they want — so every conversation starts with a real reason.</p>
          <div className="why-grid">
            {[
              { icon: <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.2" y2="16.2" /></>, title: 'Intent-based discovery', body: 'You see people who declared the same kind of thing you’re looking for — not people who just share a connection or a title.' },
              { icon: <><path d="M12 3l7 3v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6l7-3z" /><polyline points="9 12 11 14 15 9.5" /></>, title: 'Transparent trust', body: 'Every profile carries a visible completeness and trust signal — no guesswork before you reach out.' },
              { icon: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".5" fill="currentColor" /></>, title: 'Relevance over volume', body: 'One relevant conversation beats a hundred random contacts. BYN optimizes for that, not for connection counts.' },
            ].map(c => (
              <div key={c.title} className="why-card animate">
                <div className="why-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{c.icon}</svg></div>
                <h3>{c.title}</h3><p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- DISCOVERY / INTENT — intent as the visual language, not marketing copy -- */}
      <section style={{ background: 'var(--bg-subtle)' }}>
        <div className="section-inner">
          <p className="section-label animate">How Profiles Work</p>
          <h2 className="section-title animate delay-1">Every profile answers three questions.</h2>
          <p className="section-desc animate delay-2">Not a biography — a clear, scannable statement of intent.</p>
          <div className="intent-lang-row animate delay-2">
            <div className="intent-lang-card"><span className="intent-lang-label">Looking for</span><div className="intent-lang-value">Co-founder</div></div>
            <div className="intent-lang-card"><span className="intent-lang-label">Offering</span><div className="intent-lang-value">Growth expertise</div></div>
            <div className="intent-lang-card"><span className="intent-lang-label">Building</span><div className="intent-lang-value">Consumer startup</div></div>
          </div>
        </div>
      </section>

      {/* -- REAL PRODUCT SCREENS -- */}
      <section id="screens">
        <div className="section-inner section-center">
          <p className="section-label animate">The Actual Product</p>
          <h2 className="section-title animate delay-1">This is what networking looks like on BYN.</h2>
          <p className="section-desc animate delay-2">Real screens from the real app — profile, match, and conversation.</p>
          <div className="screens-grid">
            <div className="screen-slot animate">
              <ProfilePreview />
              <span className="screen-caption">Profile</span>
            </div>
            <div className="screen-slot animate delay-1">
              <MatchPreview />
              <span className="screen-caption">Connection</span>
            </div>
            <div className="screen-slot animate delay-2">
              <ConversationPreview />
              <span className="screen-caption">Conversation</span>
            </div>
          </div>
        </div>
      </section>

      {/* -- TRUST / PRIVACY — only claims that map to real, shipped mechanisms -- */}
      <section className="trust-section" id="trust">
        <div className="section-inner">
          <p className="section-label animate">Your Network. Your Control.</p>
          <h2 className="section-title animate delay-1">Trust, shown — not just claimed.</h2>
          <div className="trust-grid">
            {[
              { title: 'Profile visibility controls', body: 'You control what’s shown and to whom.', icon: <><path d="M1.5 12S6 5 12 5s10.5 7 10.5 7-4.5 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></> },
              { title: 'Verification', body: 'Identity verification signals are visible on profiles.', icon: <><path d="M12 3l7 3v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6l7-3z" /><polyline points="9 12 11 14 15 9.5" /></> },
              { title: 'Protected contact info', body: 'Your email is never shared with other users.', icon: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /><line x1="1.5" y1="1.5" x2="22.5" y2="22.5" /></> },
              { title: 'Report & block', body: 'Report or block anyone, anytime, in one tap.', icon: <><path d="M5 21V4" /><path d="M5 4h13l-2.5 4.5L18 13H5" /></> },
              { title: 'No data selling', body: 'Your profile data is never sold or shared.', icon: <><path d="M12.5 2.5 2.5 12.5l8.6 8.6a2 2 0 0 0 2.83 0l7.07-7.07a2 2 0 0 0 0-2.83l-8.5-8.7z" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /><line x1="2" y1="2" x2="22" y2="22" /></> },
              { title: 'No ads', body: 'Zero advertising. Your attention isn’t the product.', icon: <><path d="M3 10.5v3a1 1 0 0 0 1 1h2.5l5 3.5v-12l-5 3.5H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><line x1="1.5" y1="1.5" x2="22.5" y2="22.5" /></> },
            ].map(t => (
              <div key={t.title} className="trust-check animate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                <div><h3>{t.title}</h3><p>{t.body}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- CIRCLES -- */}
      <section id="circles">
        <div className="section-inner">
          <div className="circles-layout">
            <div className="circles-copy">
              <p className="section-label animate">Now Live</p>
              <h2 className="section-title animate delay-1">Post what you need. Skip the waiting.</h2>
              <p className="section-desc animate delay-2">Discover is 1:1 — you get matched, then you talk. Circles skips that: post exactly what you&apos;re after and it lands in front of everyone tracking that, not just the handful of people you&apos;d have matched with anyway.</p>
              <a href="/signup" className="btn-primary animate delay-2" style={{ marginTop: 8 }}>Explore Circles free</a>
            </div>
            <div className="animate delay-1" style={{ minHeight: 180 }}>
              <CirclePreview />
            </div>
          </div>
        </div>
      </section>

      {/* -- Download (real APK) -- */}
      <section className="download-section" id="download">
        <div className="section-inner">
          <p className="section-label animate">Get Started</p>
          <h2 className="section-title animate delay-1">Start in seconds, no install required</h2>
          <p className="section-desc animate delay-2">The full Build Your Network experience runs in your browser — sign up and start discovering in under a minute.</p>
          <div className="download-box animate delay-3">
            <a href="/signup" className="download-btn">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h6" /><polyline points="14 3 20 3 20 9" /><line x1="10" y1="13" x2="20" y2="3" /></svg>
              Open web app free
            </a>
            <div className="download-meta">
              {['Works on all devices', 'No download needed', 'Instant access'].map(m => (
                <span key={m}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -- SEO CONTENT — kept, shortened, moved below the product story; still server-rendered -- */}
      <section className="seo-section" id="about-byn">
        <div className="section-inner">
          <p className="section-label animate">Knowledge Base</p>
          <h2 className="section-title animate delay-1">What is Build Your Network?</h2>
          <div style={{ maxWidth: 720 }}>
            <p className="animate delay-2" style={{ fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.75, marginBottom: 16 }}>
              <strong style={{ color: 'var(--text)' }}>Build Your Network (BYN)</strong> is a free, intent-based professional networking platform. Every user declares what they&apos;re actively looking for — a co-founder, a mentor, an investor, or a collaborator — so discovery starts from shared purpose, not job titles or follower counts.
            </p>
            <p className="animate delay-3" style={{ fontSize: 15, color: 'var(--text-soft)', lineHeight: 1.75, marginBottom: 20 }}>
              BYN uses GPS-based location matching — discover people within 10&nbsp;km for in-person collaboration, or search nationwide and worldwide for remote connections. It runs entirely in your browser, free, in every major Indian city and beyond.
            </p>
            <div className="seo-links animate delay-3">
              {[{ href: '/networking-for-founders', label: 'For Founders' }, { href: '/linkedin-alternative', label: 'BYN vs LinkedIn' }, { href: '/networking-for-entrepreneurs', label: 'For Entrepreneurs' }, { href: '/networking-for-creators', label: 'For Creators' }, { href: '/networking-for-freelancers', label: 'For Freelancers' }, { href: '/startup-community-india', label: 'Startup Community India' }, { href: '/business-networking-app', label: 'Business Networking App' }, { href: '/networking-for-investors', label: 'For Investors' }].map(l => (
                <a key={l.href} href={l.href}>{l.label}</a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background: 'var(--card)' }}>
        <div className="section-inner">
          <h2 className="animate section-center" style={{ marginBottom: 8, fontSize: 'clamp(26px,3.2vw,38px)', fontWeight: 800, letterSpacing: '-1px' }}>Frequently asked questions</h2>
          <p className="animate delay-1 section-center" style={{ color: 'var(--text-soft)', marginBottom: 44 }}>Everything you need to know about Build Your Network</p>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            {[
              { q: 'What is Build Your Network?', a: 'Build Your Network (BYN) is a free professional networking platform for founders, entrepreneurs, and creators. It connects you with co-founders, mentors, investors, and collaborators based on your declared intent — not job titles or work history. BYN uses GPS-based location matching and runs entirely in your browser — no install required.' },
              { q: 'How is Build Your Network different from LinkedIn?', a: 'LinkedIn is built for job-seekers and recruiters. Build Your Network is built for people who want co-founders, mentors, advisors, and investors — matched by intent and skills. On BYN, every person you see has declared what they are actively looking for, making first messages contextual and response rates far higher.' },
              { q: 'How do I find a co-founder on Build Your Network?', a: 'Create a free profile, set your intent to "Looking for Co-founder", add your skills and what you’re building, and enable location discovery. BYN surfaces people with complementary skills within your chosen radius, or search Remote/Worldwide for technical co-founders anywhere.' },
              { q: 'Is Build Your Network free?', a: 'Yes — BYN is free with daily connection requests included. No credit card. Premium unlocks unlimited connections, priority discovery, tighter location filters, and profile boosting.' },
              { q: 'Is my data safe on Build Your Network?', a: 'Your email is never shared with other users. Exact GPS coordinates are only used to compute distance — never exposed to other profiles. BYN has no ads and does not sell user data.' },
              { q: 'Who uses Build Your Network?', a: 'Startup founders, solo entrepreneurs, freelancers, creators, product managers, designers, developers, angel investors, and mentors — anyone who wants connections based on intent and goals rather than résumé keywords.' },
            ].map((f, i) => (
              <details key={i} className="faq-item animate">
                <summary>{f.q}</summary>
                <div><p>{f.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="section-inner">
          <h2 className="animate">Your network defines your trajectory.</h2>
          <p className="animate delay-1">Stop collecting contacts. Start building connections that matter.</p>
          <div className="animate delay-2">
            <a href="/signup" className="btn-primary" style={{ fontSize: 16, padding: '17px 36px' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="18" y2="12" /><polyline points="12.5 6 18 12 12.5 18" /></svg>
              Open web app free
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-brand"><img src="/assets/logo.png" className="logo-img-footer" alt="Build Your Network" loading="lazy" width={26} height={26} />Build Your Network</div>
            <p className="footer-desc">An intent-based networking platform for professionals who value relevance over volume.</p>
          </div>
          <div className="footer-col"><h3>Company</h3><a href="/about">About</a><a href="/contact">Contact</a></div>
          <div className="footer-col"><h3>Legal</h3><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a></div>
          <div className="footer-col"><h3>Product</h3><a href="#screens">Product</a><a href="#circles">Circles</a><a href="#faq">FAQ</a><a href="/signup">Open Web App</a></div>
          <div className="footer-col"><h3>Support</h3><a href="mailto:support@buildyournetwork.online">support@buildyournetwork.online</a></div>
        </div>
        <div className="footer-bottom"><span>&copy; 2026 Build Your Network. All rights reserved.</span><span>Early Access Product</span></div>
      </footer>

      {/* Feedback widget — client island */}
      <FeedbackWidget />

      {/* JSON-LD schema — server-rendered, unchanged */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@graph': [
            {
              '@type': 'Organization',
              'name': 'Build Your Network',
              'alternateName': 'BYN',
              'url': 'https://buildyournetwork.online',
              'logo': { '@type': 'ImageObject', 'url': 'https://buildyournetwork.online/assets/logo.png', 'width': 512, 'height': 512 },
              'description': 'Build Your Network (BYN) is the free intent-based professional networking platform. Connect with founders, freelancers, mentors, collaborators, and career connections based on declared intent — GPS-filtered, no cold email.',
              'foundingDate': '2024',
              'email': 'support@buildyournetwork.online',
              'areaServed': ['IN', 'US', 'GB', 'EU'],
              'contactPoint': { '@type': 'ContactPoint', 'email': 'support@buildyournetwork.online', 'contactType': 'Customer Support', 'availableLanguage': ['English'] },
              'sameAs': ['https://www.producthunt.com/products/build-your-network', 'https://www.crunchbase.com/organization/build-your-network', 'https://www.linkedin.com/company/build-your-network', 'https://wellfound.com/company/build-your-network', 'https://twitter.com/buildyournetwork', 'https://www.indiehackers.com/product/build-your-network'],
            },
            {
              '@type': 'WebSite',
              'name': 'Build Your Network',
              'url': 'https://buildyournetwork.online',
              'potentialAction': { '@type': 'SearchAction', 'target': { '@type': 'EntryPoint', 'urlTemplate': 'https://buildyournetwork.online/discover?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
            },
            {
              '@type': 'SoftwareApplication',
              'name': 'Build Your Network',
              'alternateName': 'BYN',
              'url': 'https://buildyournetwork.online',
              'applicationCategory': 'BusinessApplication',
              'operatingSystem': 'Android, Web',
              'inLanguage': 'en',
              'description': 'Free intent-based professional networking platform. Find co-founders, freelancers, mentors, collaborators, and career connections based on declared intent — GPS-filtered, no cold email.',
              'offers': { '@type': 'Offer', 'price': '0', 'priceCurrency': 'USD', 'availability': 'https://schema.org/InStock' },
            },
          ],
        }) }}
      />

    </div>
    </ToastProvider>
  );
}
