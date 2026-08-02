/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import { APP_URL } from '@/lib/seo/data';
import LandingClient from '@/components/landing/LandingClient';
import MobileNav from '@/components/landing/MobileNav';
import FeedbackWidget from '@/components/landing/FeedbackWidget';

export const metadata: Metadata = {
  alternates: { canonical: 'https://buildyournetwork.online' },
};

const LANDING_CSS = `
  :root {
    --bg: #FFF4EC;
    --bg-secondary: #FDE8D7;
    --card: #FFFFFF;
    --primary: #0F766E;
    --teal: #14B8A6;
    --highlight: #CCFBF1;
    --accent: #F4A261;
    --text: #1F2937;
    --text-secondary: #6B7280;
    --text-muted: #9CA3AF;
    --shadow-soft: 0 4px 24px rgba(31,41,55,0.06);
    --shadow-hover: 0 12px 40px rgba(31,41,55,0.1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: var(--font-inter), 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .animate { opacity: 0; animation: fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
  .delay-1 { animation-delay: 0.1s; }
  .delay-2 { animation-delay: 0.2s; }
  .delay-3 { animation-delay: 0.3s; }
  .delay-4 { animation-delay: 0.4s; }
  @keyframes logoPulse {
    0%   { box-shadow: 0 0 0 0 rgba(15,118,110,0.3); }
    70%  { box-shadow: 0 0 0 7px rgba(15,118,110,0); }
    100% { box-shadow: 0 0 0 0 rgba(15,118,110,0); }
  }
  .logo-img { width:28px; height:28px; border-radius:7px; flex-shrink:0; animation:logoPulse 2.4s ease-in-out infinite; }
  .logo-img-footer { width:26px; height:26px; border-radius:6px; flex-shrink:0; }

  .skip-link {
    position:absolute; top:-48px; left:8px; z-index:1000;
    background:var(--primary); color:white; padding:12px 20px;
    border-radius:8px; font-weight:600; font-size:14px; text-decoration:none;
    transition:top 0.2s;
  }
  .skip-link:focus { top:8px; }

  nav {
    position:fixed; top:0; left:0; right:0; z-index:100;
    background:rgba(255,244,236,0.92); backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(253,232,215,0.6);
  }
  .nav-inner { max-width:1200px; margin:0 auto; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; }
  .logo { font-weight:800; font-size:20px; color:var(--primary); letter-spacing:-0.5px; text-decoration:none; display:inline-flex; align-items:center; gap:8px; }
  .nav-links { display:flex; gap:32px; align-items:center; }
  .nav-links a { text-decoration:none; color:var(--text-secondary); font-weight:500; font-size:14px; transition:color 0.2s; }
  .nav-links a:hover { color:var(--primary); }
  .nav-cta { background:var(--primary); color:white !important; padding:10px 20px; border-radius:8px; font-weight:600; font-size:13px; transition:all 0.2s; }
  .nav-cta:hover { background:#0d5f58; transform:translateY(-1px); }
  .mobile-menu-btn { display:none; background:none; border:none; cursor:pointer; padding:8px; }

  .hero { min-height:100vh; display:flex; align-items:center; padding:120px 24px 80px; position:relative; overflow:hidden; background:var(--bg); }
  .hero-bg { position:absolute; top:-20%; right:-10%; width:600px; height:600px; background:radial-gradient(circle,var(--highlight) 0%,transparent 70%); opacity:0.5; pointer-events:none; }
  .hero-inner { max-width:1200px; margin:0 auto; display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:center; width:100%; }
  .hero-content h1 { font-size:clamp(36px,5vw,56px); font-weight:800; line-height:1.1; letter-spacing:-1.5px; margin-bottom:24px; color:var(--text); }
  .hero-content h1 span { color:var(--primary); }
  .hero-content .subtitle { font-size:18px; color:var(--text-secondary); max-width:480px; margin-bottom:40px; line-height:1.7; }
  .hero-badges { display:flex; gap:12px; margin-bottom:32px; flex-wrap:wrap; }
  .badge { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:var(--card); border:1px solid var(--bg-secondary); border-radius:100px; font-size:12px; font-weight:500; color:var(--text-secondary); }
  .badge svg { width:14px; height:14px; }
  .cta-group { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .btn-primary { display:inline-flex; align-items:center; gap:10px; padding:16px 32px; background:var(--primary); color:white; text-decoration:none; border-radius:12px; font-weight:600; font-size:15px; transition:all 0.25s cubic-bezier(0.22,1,0.36,1); border:none; cursor:pointer; box-shadow:0 4px 16px rgba(15,118,110,0.25); }
  .btn-primary:hover { background:#0d5f58; transform:translateY(-2px); box-shadow:0 8px 24px rgba(15,118,110,0.35); }
  .btn-primary svg { width:20px; height:20px; }
  .btn-secondary { display:inline-flex; align-items:center; gap:8px; padding:16px 28px; background:transparent; color:var(--primary); text-decoration:none; border-radius:12px; font-weight:600; font-size:15px; border:2px solid var(--primary); transition:all 0.25s; }
  .btn-secondary:hover { background:var(--highlight); transform:translateY(-2px); }
  .hero-visual { position:relative; display:flex; justify-content:center; }
  .phone-mockup { width:280px; height:560px; background:var(--card); border-radius:36px; box-shadow:var(--shadow-hover),0 0 0 12px var(--bg-secondary); overflow:hidden; position:relative; transform:rotate(-3deg); transition:transform 0.4s; }
  .phone-mockup:hover { transform:rotate(0deg) scale(1.02); }
  .phone-notch { position:absolute; top:0; left:50%; transform:translateX(-50%); width:120px; height:28px; background:var(--text); border-radius:0 0 16px 16px; z-index:10; }
  .phone-screen { padding:48px 20px 20px; height:100%; overflow-y:auto; }
  .screen-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
  .screen-title { font-weight:700; font-size:20px; }
  .filter-pill { padding:6px 14px; background:var(--highlight); border-radius:20px; font-size:11px; font-weight:600; color:var(--primary); }
  .profile-card { background:var(--bg); border-radius:16px; padding:16px; margin-bottom:12px; display:flex; gap:12px; align-items:center; }
  .profile-avatar { width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:16px; flex-shrink:0; }
  .profile-info .mock-name { font-size:14px; font-weight:600; margin-bottom:2px; }
  .profile-info p { font-size:11px; color:var(--text-secondary); }
  .intent-tag { display:inline-block; padding:3px 10px; background:var(--highlight); color:var(--primary); border-radius:12px; font-size:10px; font-weight:600; margin-top:4px; }
  .trust-score { margin-left:auto; text-align:center; }
  .trust-score .score { font-size:18px; font-weight:800; color:var(--primary); }
  .trust-score .label { font-size:9px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; }

  section { padding:100px 24px; position:relative; }
  .section-inner { max-width:1100px; margin:0 auto; }
  .section-label { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:var(--primary); margin-bottom:16px; }
  .section-title { font-size:clamp(28px,3.5vw,40px); font-weight:800; letter-spacing:-1px; margin-bottom:20px; line-height:1.2; }
  .section-desc { font-size:17px; color:var(--text-secondary); max-width:600px; line-height:1.7; text-wrap:balance; }

  .trust-section { background:var(--bg-secondary); }
  .trust-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:24px; margin-top:48px; }
  .trust-card { background:var(--card); padding:32px 24px; border-radius:16px; text-align:center; box-shadow:var(--shadow-soft); transition:all 0.3s; border:1px solid rgba(253,232,215,0.5); }
  .trust-card:hover { transform:translateY(-4px); box-shadow:var(--shadow-hover); }
  .trust-icon { width:48px; height:48px; background:var(--highlight); border-radius:14px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
  .trust-icon svg { width:24px; height:24px; color:var(--primary); }
  .trust-card h3 { font-size:16px; font-weight:700; margin-bottom:8px; }
  .trust-card p { font-size:13px; color:var(--text-secondary); line-height:1.6; }

  .features-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:32px; margin-top:56px; }
  .feature-card { background:var(--card); padding:40px 32px; border-radius:20px; box-shadow:var(--shadow-soft); transition:all 0.3s; border:1px solid rgba(253,232,215,0.4); }
  .feature-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-hover); }
  .feature-num { width:40px; height:40px; background:var(--primary); color:white; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; margin-bottom:20px; }
  .feature-card h3 { font-size:20px; font-weight:700; margin-bottom:12px; }
  .feature-card p { font-size:15px; color:var(--text-secondary); line-height:1.7; }

  .steps-section { background:var(--bg-secondary); }
  .steps-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:40px; margin-top:56px; position:relative; }
  .steps-grid::before { content:''; position:absolute; top:40px; left:16.66%; right:16.66%; height:2px; background:linear-gradient(to right,var(--primary),var(--teal)); opacity:0.2; }
  .step-card { text-align:center; position:relative; z-index:1; }
  .step-num { width:80px; height:80px; background:var(--card); border:3px solid var(--primary); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:800; color:var(--primary); margin:0 auto 24px; box-shadow:var(--shadow-soft); }
  .step-card h3 { font-size:20px; font-weight:700; margin-bottom:12px; }
  .step-card p { font-size:15px; color:var(--text-secondary); line-height:1.7; }

  .preview-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:32px; margin-top:56px; }
  .preview-card { background:var(--card); border-radius:24px; padding:24px; box-shadow:var(--shadow-soft); transition:all 0.3s; border:1px solid rgba(253,232,215,0.4); }
  .preview-card:hover { transform:translateY(-8px); box-shadow:var(--shadow-hover); }
  .preview-label { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--primary); margin-bottom:16px; text-align:center; }
  .mini-phone { width:100%; max-width:240px; margin:0 auto; background:var(--text); border-radius:24px; padding:12px 12px 16px; box-shadow:0 8px 32px rgba(0,0,0,0.15); }
  .mini-screen { background:var(--bg); border-radius:16px; padding:16px; min-height:320px; }
  .mini-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
  .mini-header .mock-title { font-size:14px; font-weight:700; }
  .mini-header .dots { display:flex; gap:4px; }
  .mini-header .dots span { width:6px; height:6px; background:var(--text-muted); border-radius:50%; }
  .mini-profile { background:var(--card); border-radius:12px; padding:12px; margin-bottom:10px; display:flex; gap:10px; align-items:center; }
  .mini-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); flex-shrink:0; }
  .mini-info .mock-name { font-size:12px; font-weight:600; }
  .mini-info p { font-size:10px; color:var(--text-secondary); }
  .mini-chat { display:flex; flex-direction:column; gap:10px; }
  .chat-bubble { padding:10px 14px; border-radius:14px; font-size:12px; max-width:80%; }
  .chat-bubble.sent { background:var(--primary); color:white; align-self:flex-end; border-bottom-right-radius:4px; }
  .chat-bubble.received { background:var(--card); color:var(--text); align-self:flex-start; border-bottom-left-radius:4px; }
  .profile-detail { text-align:center; padding:20px 0; }
  .profile-detail .big-avatar { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); margin:0 auto 12px; }
  .profile-detail .mock-name { font-size:16px; font-weight:700; margin-bottom:4px; }
  .profile-detail p { font-size:12px; color:var(--text-secondary); }
  .profile-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:16px; }
  .stat-box { background:var(--card); padding:10px; border-radius:10px; text-align:center; }
  .stat-box .num { font-size:16px; font-weight:800; color:var(--primary); }
  .stat-box .lbl { font-size:9px; color:var(--text-muted); text-transform:uppercase; }

  .diff-section { background:var(--bg-secondary); }
  .diff-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:32px; margin-top:56px; }
  .diff-card { background:var(--card); padding:40px 32px; border-radius:20px; box-shadow:var(--shadow-soft); transition:all 0.3s; border:1px solid rgba(253,232,215,0.4); position:relative; overflow:hidden; }
  .diff-card::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(to right,var(--primary),var(--teal)); }
  .diff-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-hover); }
  .diff-icon { width:52px; height:52px; background:var(--highlight); border-radius:16px; display:flex; align-items:center; justify-content:center; margin-bottom:20px; }
  .diff-icon svg { width:26px; height:26px; color:var(--primary); }
  .diff-card h3 { font-size:20px; font-weight:700; margin-bottom:12px; }
  .diff-card p { font-size:15px; color:var(--text-secondary); line-height:1.7; }

  .circles-showcase { margin-top:48px; background:var(--card); border-radius:24px; padding:16px; box-shadow:var(--shadow-soft); border:1px solid rgba(253,232,215,0.5); text-align:center; }
  .circles-card { background:#fff; border-radius:20px; padding:22px; text-align:left; max-width:480px; margin:0 auto 20px; box-shadow:0 8px 32px rgba(31,41,55,0.12); }
  .circles-card-head { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .circles-card-avatar { width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); flex-shrink:0; }
  .circles-card-name { font-size:14px; font-weight:700; color:var(--text); }
  .circles-card-meta { font-size:11px; color:var(--text-muted); }
  .circles-card-tag { margin-left:auto; font-size:10px; font-weight:700; padding:4px 10px; border-radius:999px; background:var(--highlight); color:var(--primary); white-space:nowrap; }
  .circles-card-text { font-size:14px; color:var(--text); line-height:1.6; margin-bottom:16px; }
  .circles-card-actions { display:flex; gap:8px; }
  .circles-card-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:999px; border:1.5px solid var(--bg-secondary); background:var(--bg); color:var(--text-secondary); font-size:12px; font-weight:600; }
  .circles-card-btn svg { width:13px; height:13px; flex-shrink:0; }
  .circles-card-btn.collab { border-color:rgba(21,184,166,0.35); color:var(--primary); background:var(--highlight); }
  .circles-caption { max-width:520px; margin:0 auto 24px; color:var(--text-muted); font-size:14px; line-height:1.6; }
  .demo-video-wrap { margin-top:40px; max-width:860px; margin-left:auto; margin-right:auto; border-radius:24px; overflow:hidden; box-shadow:var(--shadow-hover); border:1px solid rgba(253,232,215,0.5); background:#0F172A; }

  /* ── Feature-accurate animated motion graphic (crisp CSS, not screenshots) ── */
  .demo-stage { position:relative; width:100%; aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; overflow:hidden; background:radial-gradient(ellipse at 50% 15%,rgba(21,184,166,0.28),transparent 60%),radial-gradient(circle at 12% 88%,rgba(253,232,215,0.14),transparent 45%),#0F172A; }
  .demo-badge { position:absolute; top:20px; left:20px; display:flex; align-items:center; gap:7px; padding:6px 13px; border-radius:999px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.75); font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; z-index:2; }
  .demo-badge .dot { width:6px; height:6px; border-radius:50%; background:#4ADE80; box-shadow:0 0 0 3px rgba(74,222,128,0.25); animation:demoLive 1.6s ease-in-out infinite; }
  @keyframes demoLive { 0%,100%{opacity:1} 50%{opacity:0.35} }

  .demo-window { position:relative; width:78%; max-width:380px; border-radius:16px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.5); background:#fff; }
  .demo-window-bar { display:flex; align-items:center; gap:6px; padding:10px 14px; background:#EEF1F5; }
  .demo-window-bar span { width:9px; height:9px; border-radius:50%; background:#D8DEE6; }
  .demo-window-screen { position:relative; width:100%; aspect-ratio:5/4; overflow:hidden; background:var(--bg); }
  .demo-scene { position:absolute; inset:0; opacity:0; padding:16px; box-sizing:border-box; display:flex; flex-direction:column; }
  .demo-scene-1 { animation:demoScene1 12s ease-in-out infinite; }
  .demo-scene-2 { animation:demoScene2 12s ease-in-out infinite; }
  .demo-scene-3 { animation:demoScene3 12s ease-in-out infinite; }
  @keyframes demoScene1 { 0%,2%{opacity:0} 5%,30%{opacity:1} 34%,100%{opacity:0} }
  @keyframes demoScene2 { 0%,32%{opacity:0} 36%,63%{opacity:1} 67%,100%{opacity:0} }
  @keyframes demoScene3 { 0%,65%{opacity:0} 69%,96%{opacity:1} 99%,100%{opacity:0} }

  .demo-feature-label { font-size:10px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; color:var(--primary); margin-bottom:10px; }
  .demo-person { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  .demo-avatar { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); flex-shrink:0; }
  .demo-person-name { font-size:13px; font-weight:700; color:var(--text); }
  .demo-person-sub { font-size:10px; color:var(--text-muted); }
  .demo-match-pill { margin-left:auto; background:var(--highlight); color:var(--primary); font-size:9px; font-weight:800; padding:3px 9px; border-radius:999px; white-space:nowrap; }

  .demo-filter-row { display:flex; gap:6px; margin-bottom:10px; }
  .demo-filter-chip { font-size:9px; font-weight:700; padding:4px 10px; border-radius:999px; border:1px solid var(--bg-secondary); color:var(--text-secondary); background:#fff; display:flex; align-items:center; gap:4px; }
  .demo-scene-1 .demo-filter-chip:nth-child(1) { animation:demoFilterA 12s ease-in-out infinite; }
  .demo-scene-1 .demo-filter-chip:nth-child(2) { animation:demoFilterB 12s ease-in-out infinite; }
  @keyframes demoFilterA { 0%,19%{background:var(--primary);color:#fff;border-color:var(--primary)} 22%,100%{background:#fff;color:var(--text-secondary);border-color:var(--bg-secondary)} }
  @keyframes demoFilterB { 0%,19%{background:#fff;color:var(--text-secondary);border-color:var(--bg-secondary)} 22%,100%{background:var(--primary);color:#fff;border-color:var(--primary)} }

  .demo-why { background:#fff; border-radius:10px; padding:10px 12px; margin-bottom:10px; box-shadow:0 2px 10px rgba(15,23,42,0.05); }
  .demo-why-label { font-size:9px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; color:var(--primary); margin-bottom:7px; }
  .demo-why-item { display:flex; align-items:flex-start; gap:6px; font-size:11px; color:var(--text-secondary); line-height:1.4; margin-bottom:5px; opacity:0; transform:translateX(-6px); }
  .demo-why-item svg { width:11px; height:11px; color:var(--primary); flex-shrink:0; margin-top:1px; }
  .demo-scene-1 .demo-why-item:nth-child(2) { animation:demoReveal1a 12s ease-out infinite; }
  .demo-scene-1 .demo-why-item:nth-child(3) { animation:demoReveal1b 12s ease-out infinite; }
  .demo-scene-1 .demo-why-item:nth-child(4) { animation:demoReveal1c 12s ease-out infinite; }
  @keyframes demoReveal1a { 0%,7%{opacity:0;transform:translateX(-6px)} 10%,100%{opacity:1;transform:translateX(0)} }
  @keyframes demoReveal1b { 0%,11%{opacity:0;transform:translateX(-6px)} 14%,100%{opacity:1;transform:translateX(0)} }
  @keyframes demoReveal1c { 0%,15%{opacity:0;transform:translateX(-6px)} 18%,100%{opacity:1;transform:translateX(0)} }

  .demo-tags { display:flex; flex-wrap:wrap; gap:6px; }
  .demo-tag { font-size:10px; font-weight:600; padding:4px 10px; border-radius:999px; background:#fff; color:var(--text-secondary); border:1px solid var(--bg-secondary); opacity:0; transform:scale(0.85); }
  .demo-scene-1 .demo-tag:nth-child(1) { animation:demoTagA 12s ease-out infinite; }
  .demo-scene-1 .demo-tag:nth-child(2) { animation:demoTagB 12s ease-out infinite; }
  @keyframes demoTagA { 0%,20%{opacity:0;transform:scale(0.85)} 23%,100%{opacity:1;transform:scale(1)} }
  @keyframes demoTagB { 0%,22%{opacity:0;transform:scale(0.85)} 25%,100%{opacity:1;transform:scale(1)} }

  .demo-btn-row { display:flex; gap:8px; margin-top:12px; }
  .demo-btn { flex:1; text-align:center; padding:9px; border-radius:10px; font-size:11px; font-weight:700; }
  .demo-btn-ghost { background:#fff; color:var(--text-secondary); border:1px solid var(--bg-secondary); }
  .demo-btn-primary { background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; gap:5px; }
  .demo-btn-check { opacity:0; transform:scale(0.6); display:inline-block; }
  .demo-scene-1 .demo-btn-check { animation:demoCheck 12s ease-out infinite; }
  @keyframes demoCheck { 0%,26%{opacity:0;transform:scale(0.6)} 29%{opacity:1;transform:scale(1.15)} 31%,100%{opacity:1;transform:scale(1)} }

  .demo-score-row { display:flex; justify-content:space-between; align-items:baseline; font-size:11px; font-weight:700; color:var(--text); margin-bottom:6px; }
  .demo-score-row span:last-child { color:var(--primary); font-size:13px; }
  .demo-score-track { height:7px; background:#fff; border-radius:4px; overflow:hidden; margin-bottom:10px; box-shadow:inset 0 1px 2px rgba(15,23,42,0.08); }
  .demo-score-fill { height:100%; background:linear-gradient(90deg,var(--teal),var(--primary)); border-radius:4px; width:0%; }
  .demo-scene-2 .demo-score-fill { animation:demoScoreFill 12s ease-out infinite; }
  @keyframes demoScoreFill { 0%,39%{width:0%} 52%,100%{width:92%} }
  .demo-complete { font-size:11px; color:var(--primary); font-weight:700; text-align:center; opacity:0; margin-bottom:10px; }
  .demo-scene-2 .demo-complete { animation:demoCompleteFade 12s ease-out infinite; }
  @keyframes demoCompleteFade { 0%,53%{opacity:0} 57%,100%{opacity:1} }
  .demo-about { background:#fff; border-radius:10px; padding:10px 12px; box-shadow:0 2px 10px rgba(15,23,42,0.05); opacity:0; transform:translateY(6px); }
  .demo-scene-2 .demo-about { animation:demoAboutFade 12s ease-out infinite; }
  @keyframes demoAboutFade { 0%,59%{opacity:0;transform:translateY(6px)} 63%,100%{opacity:1;transform:translateY(0)} }
  .demo-about-label { font-size:9px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; color:var(--text-muted); margin-bottom:5px; }
  .demo-about p { font-size:11px; color:var(--text-secondary); line-height:1.5; }

  .demo-post-card { background:#fff; border-radius:10px; padding:12px; box-shadow:0 2px 10px rgba(15,23,42,0.05); }
  .demo-post-text { font-size:11.5px; color:var(--text); line-height:1.5; margin:8px 0 10px; opacity:0; transform:translateY(4px); }
  .demo-scene-3 .demo-post-text { animation:demoPostFade 12s ease-out infinite; }
  @keyframes demoPostFade { 0%,74%{opacity:0;transform:translateY(4px)} 78%,100%{opacity:1;transform:translateY(0)} }
  .demo-post-tag { display:inline-block; font-size:9px; font-weight:700; padding:3px 9px; border-radius:999px; background:var(--highlight); color:var(--primary); opacity:0; transform:scale(0.85); }
  .demo-scene-3 .demo-post-tag { animation:demoTagA 12s ease-out infinite; animation-delay:0s; }
  .demo-post-replies { display:flex; align-items:center; gap:6px; margin-top:12px; opacity:0; }
  .demo-scene-3 .demo-post-replies { animation:demoRepliesFade 12s ease-out infinite; }
  @keyframes demoRepliesFade { 0%,85%{opacity:0} 88%,100%{opacity:1} }
  .demo-reply-avatar { width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg,var(--teal),var(--primary)); margin-left:-6px; border:2px solid #fff; }
  .demo-reply-avatar:first-child { margin-left:0; }
  .demo-post-replies span { font-size:10px; color:var(--text-muted); margin-left:6px; }

  .demo-dots { position:absolute; bottom:18px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:2; }
  .demo-dots span { width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.25); transition:background 0.3s; }
  .demo-dots .d1 { animation:demoDot1 12s ease-in-out infinite; }
  .demo-dots .d2 { animation:demoDot2 12s ease-in-out infinite; }
  .demo-dots .d3 { animation:demoDot3 12s ease-in-out infinite; }
  @keyframes demoDot1 { 0%,2%{background:rgba(255,255,255,0.25)} 5%,30%{background:#fff} 34%,100%{background:rgba(255,255,255,0.25)} }
  @keyframes demoDot2 { 0%,32%{background:rgba(255,255,255,0.25)} 36%,63%{background:#fff} 67%,100%{background:rgba(255,255,255,0.25)} }
  @keyframes demoDot3 { 0%,65%{background:rgba(255,255,255,0.25)} 69%,96%{background:#fff} 99%,100%{background:rgba(255,255,255,0.25)} }

  @media (prefers-reduced-motion: reduce) {
    .demo-scene-1, .demo-scene-2, .demo-scene-3, .demo-why-item, .demo-tag, .demo-btn-check, .demo-filter-chip, .demo-score-fill, .demo-complete, .demo-about, .demo-post-text, .demo-post-tag, .demo-post-replies, .demo-dots span, .demo-badge .dot { animation:none !important; }
    .demo-scene-1 { opacity:1; }
    .demo-scene-1 .demo-why-item, .demo-scene-1 .demo-tag, .demo-scene-1 .demo-btn-check { opacity:1; transform:none; }
    .demo-scene-2, .demo-scene-3 { display:none; }
  }

  .download-section { background:linear-gradient(135deg,var(--primary),#0d5f58); color:white; text-align:center; }
  .download-section .section-label { color:var(--highlight); }
  .download-section .section-title { color:white; }
  .download-section .section-desc { color:rgba(255,255,255,0.8); }
  .download-box { background:rgba(255,255,255,0.1); backdrop-filter:blur(10px); border-radius:24px; padding:48px; margin-top:48px; border:1px solid rgba(255,255,255,0.15); }
  .download-btn { display:inline-flex; align-items:center; gap:12px; padding:20px 40px; background:white; color:var(--primary); text-decoration:none; border-radius:14px; font-weight:700; font-size:17px; transition:all 0.25s; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .download-btn:hover { transform:translateY(-3px); box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .download-meta { display:flex; justify-content:center; gap:32px; margin-top:24px; flex-wrap:wrap; }
  .download-meta span { font-size:13px; color:rgba(255,255,255,0.7); display:flex; align-items:center; gap:6px; }
  .download-meta svg { width:16px; height:16px; }
  .install-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-top:40px; text-align:left; }
  .install-step { background:rgba(255,255,255,0.08); padding:24px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); }
  .install-step .num { width:36px; height:36px; background:var(--accent); color:white; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px; margin-bottom:12px; }
  .install-step h3 { font-size:15px; font-weight:600; margin-bottom:6px; color:white; }
  .install-step p { font-size:13px; color:rgba(255,255,255,0.7); line-height:1.6; }

  .final-cta { text-align:center; padding:120px 24px; }
  .final-cta h2 { font-size:clamp(32px,4vw,48px); font-weight:800; letter-spacing:-1px; margin-bottom:20px; }
  .final-cta p { font-size:18px; color:var(--text-secondary); margin-bottom:40px; }

  footer { background:var(--text); color:white; padding:60px 24px 40px; }
  .footer-inner { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr; gap:48px; }
  .footer-brand { font-size:20px; font-weight:800; color:var(--highlight); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
  .footer-desc { font-size:14px; color:var(--text-muted); line-height:1.7; }
  .footer-col h3 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:20px; }
  .footer-col a { display:block; color:rgba(255,255,255,0.7); text-decoration:none; font-size:14px; margin-bottom:12px; transition:color 0.2s; }
  .footer-col a:hover { color:white; }
  .footer-bottom { max-width:1100px; margin:40px auto 0; padding-top:24px; border-top:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; font-size:13px; color:var(--text-muted); }

  .feedback-tab { position:fixed; right:0; top:50%; transform:translateY(-50%) translateX(2px); background:var(--primary); color:white; padding:14px 10px 14px 14px; border-radius:12px 0 0 12px; cursor:pointer; z-index:99; display:flex; flex-direction:column; align-items:center; gap:6px; font-size:11px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; box-shadow:-4px 4px 20px rgba(15,118,110,0.3); transition:all 0.3s cubic-bezier(0.22,1,0.36,1); writing-mode:vertical-rl; text-orientation:mixed; line-height:1; border:none; }
  .feedback-tab svg { transform:rotate(-90deg); flex-shrink:0; }
  .feedback-tab:hover { transform:translateY(-50%) translateX(0); background:#0d5f58; box-shadow:-6px 6px 28px rgba(15,118,110,0.4); }
  .feedback-tab span { transform:rotate(180deg); }
  .feedback-overlay { position:fixed; inset:0; background:rgba(31,41,55,0.4); backdrop-filter:blur(8px); z-index:200; }
  .feedback-modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; max-width:480px; background:var(--card); border-radius:20px; box-shadow:0 24px 64px rgba(31,41,55,0.2); z-index:201; overflow:hidden; margin:0 16px; }
  .feedback-header { display:flex; justify-content:space-between; align-items:center; padding:24px 28px 0; }
  .feedback-header h3 { font-size:20px; font-weight:700; color:var(--text); }
  .feedback-close { background:none; border:none; cursor:pointer; padding:6px; border-radius:8px; color:var(--text-muted); transition:all 0.2s; display:flex; align-items:center; justify-content:center; }
  .feedback-close:hover { background:var(--bg); color:var(--text); }
  .feedback-body { padding:20px 28px 28px; }
  .feedback-intro { font-size:14px; color:var(--text-secondary); margin-bottom:20px; line-height:1.6; }
  .feedback-field { margin-bottom:18px; }
  .feedback-field label { display:block; font-size:13px; font-weight:600; color:var(--text); margin-bottom:6px; }
  .feedback-field input, .feedback-field select, .feedback-field textarea { width:100%; padding:12px 14px; border:1.5px solid var(--bg-secondary); border-radius:10px; font-family:inherit; font-size:14px; color:var(--text); background:var(--bg); transition:all 0.2s; outline:none; resize:vertical; }
  .feedback-field input:focus, .feedback-field select:focus, .feedback-field textarea:focus { border-color:var(--primary); background:var(--card); box-shadow:0 0 0 3px rgba(15,118,110,0.08); }
  .feedback-submit { width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.25s; margin-top:8px; }
  .feedback-submit:hover { background:#0d5f58; transform:translateY(-1px); }
  .field-hint { display:block; font-size:12px; color:var(--text-muted); margin-top:4px; }
  .feedback-done { padding:12px 32px; background:var(--bg); color:var(--text); border:1.5px solid var(--bg-secondary); border-radius:10px; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .feedback-done:hover { background:var(--bg-secondary); }
  .success-icon { width:64px; height:64px; background:var(--highlight); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; color:var(--primary); }
  .faq-item { border-bottom:1px solid var(--bg-secondary); }
  .faq-item summary { cursor:pointer; padding:20px 0; font-size:16px; font-weight:600; color:var(--text); list-style:none; display:flex; justify-content:space-between; align-items:center; gap:16px; user-select:none; }
  .faq-item summary::-webkit-details-marker { display:none; }
  .faq-item summary::after { content:'+'; font-size:22px; color:var(--primary); flex-shrink:0; transition:transform .25s; }
  .faq-item[open] summary::after { transform:rotate(45deg); }
  .faq-item div { padding:0 0 20px; }
  .faq-item div p { color:var(--text-secondary); line-height:1.7; font-size:15px; }

  @media (max-width:900px) {
    .hero-inner { grid-template-columns:1fr; gap:48px; }
    .hero-visual { order:-1; }
    .phone-mockup { width:240px; height:480px; }
    .trust-grid { grid-template-columns:repeat(2,1fr); }
    .features-grid { grid-template-columns:1fr; }
    .steps-grid { grid-template-columns:1fr; }
    .steps-grid::before { display:none; }
    .preview-grid { grid-template-columns:1fr; }
    .diff-grid { grid-template-columns:1fr; }
    .install-steps { grid-template-columns:1fr; }
    .footer-inner { grid-template-columns:1fr 1fr; }
    .nav-links { display:none; }
    .nav-links.open { display:flex; flex-direction:column; position:absolute; top:100%; left:0; right:0; background:rgba(255,244,236,0.98); backdrop-filter:blur(20px); border-top:1px solid rgba(253,232,215,0.8); padding:16px 24px 20px; gap:18px; box-shadow:0 8px 24px rgba(0,0,0,0.08); z-index:999; }
    .mobile-menu-btn { display:block; }
  }
  @media (max-width:600px) {
    .trust-grid { grid-template-columns:1fr; }
    .footer-inner { grid-template-columns:1fr; }
    .footer-bottom { flex-direction:column; gap:12px; text-align:center; }
    .cta-group { flex-direction:column; width:100%; }
    .cta-group a { width:100%; justify-content:center; }
    .download-box { padding:32px 24px; }
    .feedback-tab { right:auto; left:50%; top:auto; bottom:0; transform:translateX(-50%) translateY(2px); border-radius:12px 12px 0 0; padding:10px 20px; flex-direction:row; writing-mode:horizontal-tb; text-orientation:mixed; box-shadow:0 -4px 20px rgba(15,118,110,0.3); }
    .feedback-tab svg { transform:none; }
    .feedback-tab span { transform:none; }
    .feedback-tab:hover { transform:translateX(-50%) translateY(0); }
  }
`;

async function getStats() {
  try {
    const r = await fetch(`${APP_URL}/api/stats/public`, { next: { revalidate: 3600 } });
    const d = await r.json();
    return d.users > 0 ? (d as { users: number; connections: number }) : null;
  } catch { return null; }
}

export default async function HomePage() {
  const stats = await getStats();

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      <a href="#hero" className="skip-link">Skip to main content</a>

      {/* Auth redirect + animations — renders null, client only */}
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

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-bg" />
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badges animate">
              <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>Works in browser</span>
              <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>No install needed</span>
              <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>Early Access</span>
            </div>
            <h1 className="animate delay-1">Build Your <span>Professional Network</span> — by Intent</h1>
            <p className="subtitle animate delay-2">The platform where professionals connect on purpose. Founders, freelancers, career changers, mentors, and makers — find the right people based on what you actually want, not job titles.</p>
            {stats && (
              <div className="hero-badges animate delay-2" style={{ marginBottom: '24px' }}>
                <span className="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>{stats.users.toLocaleString()} professionals</span>
              </div>
            )}
            <div className="cta-group animate delay-3">
              <a href="/signup" className="btn-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>Open Web App Free</a>
              <a href="#how" className="btn-secondary">See how it works<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg></a>
            </div>
          </div>
          <div className="hero-visual animate delay-2">
            <div className="phone-mockup">
              <div className="phone-notch" />
              <div className="phone-screen">
                <div className="screen-header"><span className="screen-title">Discover</span><span className="filter-pill">Intent: All</span></div>
                {[{ i: 'SK', n: 'Sarah Kim', r: 'Climate tech founder, ex-McKinsey', t: 'Looking for: Co-founder', s: 94 }, { i: 'JM', n: 'James Miller', r: 'Senior engineer, exploring freelance', t: 'Looking for: Clients', s: 88 }, { i: 'AL', n: 'Aisha Lopez', r: 'Marketing lead, career pivot', t: 'Looking for: Mentor', s: 91 }].map(p => (
                  <div key={p.i} className="profile-card">
                    <div className="profile-avatar">{p.i}</div>
                    <div className="profile-info"><p className="mock-name">{p.n}</p><p>{p.r}</p><span className="intent-tag">{p.t}</span></div>
                    <div className="trust-score"><div className="score">{p.s}</div><div className="label">Trust</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature-accurate animated motion graphic — Discover / Profile / Circles, built with crisp CSS (not screenshots) */}
      <section id="demo">
        <div className="section-inner">
          <p className="section-label animate">See It In Action</p>
          <h2 className="section-title animate delay-1">A quick look at how it actually works.</h2>
          <p className="section-desc animate delay-2">Discover by intent, a transparent profile, and Circles — where you collaborate directly.</p>
          <div className="demo-video-wrap animate delay-2">
            <div className="demo-stage" role="img" aria-label="Animated preview walking through the Discover, Profile, and Circles features">
              <span className="demo-badge"><span className="dot" />Product preview</span>
              <div className="demo-window">
                <div className="demo-window-bar"><span /><span /><span /></div>
                <div className="demo-window-screen">

                  {/* Scene 1 — Discover: why-you-matched reasoning */}
                  <div className="demo-scene demo-scene-1">
                    <p className="demo-feature-label">Discover — matched by intent</p>
                    <div className="demo-person">
                      <div className="demo-avatar" />
                      <div><p className="demo-person-name">Priya Sharma</p><p className="demo-person-sub">Product designer · Bengaluru</p></div>
                      <span className="demo-match-pill">91% match</span>
                    </div>
                    <div className="demo-filter-row">
                      <span className="demo-filter-chip">📍 10 km</span>
                      <span className="demo-filter-chip">🌐 Worldwide</span>
                    </div>
                    <div className="demo-why">
                      <p className="demo-why-label">Why you matched</p>
                      <div className="demo-why-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>Same city · Bengaluru</div>
                      <div className="demo-why-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>Both looking for: Co-founder</div>
                      <div className="demo-why-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>Shared skills: Product, Growth</div>
                    </div>
                    <div className="demo-tags"><span className="demo-tag">Building</span><span className="demo-tag">SaaS</span></div>
                    <div className="demo-btn-row">
                      <div className="demo-btn demo-btn-ghost">Skip</div>
                      <div className="demo-btn demo-btn-primary">Connect <span className="demo-btn-check">✓</span></div>
                    </div>
                  </div>

                  {/* Scene 2 — Profile: transparent trust score */}
                  <div className="demo-scene demo-scene-2">
                    <p className="demo-feature-label">Profile — transparent trust</p>
                    <div className="demo-person">
                      <div className="demo-avatar" />
                      <div><p className="demo-person-name">Priya Sharma</p><p className="demo-person-sub">Collaborate on projects</p></div>
                    </div>
                    <div className="demo-score-row"><span>Trust score</span><span>92/100</span></div>
                    <div className="demo-score-track"><div className="demo-score-fill" /></div>
                    <p className="demo-complete">Profile complete ✓</p>
                    <div className="demo-about">
                      <p className="demo-about-label">Working on</p>
                      <p>A design-tech platform for async product reviews.</p>
                    </div>
                  </div>

                  {/* Scene 3 — Circles: collaborate directly, no waiting on a match */}
                  <div className="demo-scene demo-scene-3">
                    <p className="demo-feature-label">Circles — collaborate directly</p>
                    <div className="demo-post-card">
                      <div className="demo-person" style={{ marginBottom: 8 }}>
                        <div className="demo-avatar" />
                        <div><p className="demo-person-name">Priya Sharma</p><p className="demo-person-sub">2m ago</p></div>
                        <span className="demo-post-tag">Seeking</span>
                      </div>
                      <p className="demo-post-text">Looking for a growth marketer to launch a B2B SaaS product — let&apos;s build together.</p>
                      <div className="demo-post-replies">
                        <div className="demo-reply-avatar" /><div className="demo-reply-avatar" /><div className="demo-reply-avatar" />
                        <span>3 people asked to collaborate</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
              <div className="demo-dots"><span className="d1" /><span className="d2" /><span className="d3" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="trust-section" id="trust">
        <div className="section-inner">
          <p className="section-label animate">Trust &amp; Transparency</p>
          <h2 className="section-title animate delay-1">Safe to install. Built for serious users.</h2>
          <p className="section-desc animate delay-2">We believe trust is earned, not claimed. Here&apos;s exactly what you get — and what you don&apos;t.</p>
          <div className="trust-grid">
            {[
              { icon: <><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></>, title: 'No Spam', body: 'No bulk messages. No random outreach. Only intentional, relevant connection requests.', d: '' },
              { icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></>, title: 'No Ads', body: "Zero advertising. Your attention is not our product. We don't sell impressions.", d: 'delay-1' },
              { icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>, title: 'No Data Selling', body: 'Your profile data stays yours. We never share, sell, or monetize your personal information.', d: 'delay-2' },
              { icon: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>, title: 'Early Access', body: 'This is a live, working product in active development. Your feedback shapes what comes next.', d: 'delay-3' },
            ].map(c => (
              <div key={c.title} className={`trust-card animate ${c.d}`}>
                <div className="trust-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{c.icon}</svg></div>
                <h3>{c.title}</h3><p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features">
        <div className="section-inner">
          <p className="section-label animate">What It Does</p>
          <h2 className="section-title animate delay-1">Connect with intent. Find relevant people.</h2>
          <p className="section-desc animate delay-2">Build Your Network replaces random networking with purposeful discovery. Every connection starts with a clear reason.</p>
          <div className="features-grid">
            {[
              { n: 1, title: 'Discover by Intent', body: 'See people who are actively looking for the same things you are — jobs, clients, mentors, co-founders, collaborators, or peers.', d: '' },
              { n: 2, title: 'Filter by Goals', body: 'Narrow your search by industry, role, stage, or specific intent. No noise, only relevance.', d: 'delay-1' },
              { n: 3, title: 'Build Meaningful Connections', body: 'Every interaction is grounded in shared purpose. Start conversations that actually matter.', d: 'delay-2' },
            ].map(f => (
              <div key={f.n} className={`feature-card animate ${f.d}`}>
                <div className="feature-num">{f.n}</div><h3>{f.title}</h3><p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="steps-section" id="how">
        <div className="section-inner">
          <p className="section-label animate">How It Works</p>
          <h2 className="section-title animate delay-1">Three steps to the right connection.</h2>
          <p className="section-desc animate delay-2">No complex onboarding. No endless scrolling. Just clarity, relevance, and action.</p>
          <div className="steps-grid">
            {[
              { n: 1, title: 'Define Your Intent', body: "Tell the platform what you're looking for — a job, client, co-founder, mentor, collaborator, or peer. The clearer your intent, the better your matches.", d: '' },
              { n: 2, title: 'Discover Relevant People', body: 'Browse profiles filtered by your goals. See trust scores, background context, and exactly what each person is looking for.', d: 'delay-1' },
              { n: 3, title: 'Start a Connection', body: 'Send a purposeful connection request. When accepted, start a focused conversation built on mutual intent.', d: 'delay-2' },
            ].map(s => (
              <div key={s.n} className={`step-card animate ${s.d}`}>
                <div className="step-num">{s.n}</div><h3>{s.title}</h3><p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App Preview */}
      <section id="preview">
        <div className="section-inner">
          <p className="section-label animate">App Preview</p>
          <h2 className="section-title animate delay-1">Built for clarity. Designed for trust.</h2>
          <p className="section-desc animate delay-2">Every screen is designed to reduce friction and build confidence — from discovery to your first message.</p>
          <div className="preview-grid">
            <div className="preview-card animate">
              <p className="preview-label">Discover Screen</p>
              <div className="mini-phone"><div className="mini-screen">
                <div className="mini-header"><p className="mock-title">Discover</p><div className="dots"><span /><span /><span /></div></div>
                {[{ n: 'MC', name: 'Marcus Chen', role: 'AI researcher · Looking for: PM' }, { n: 'ER', name: 'Elena Rossi', role: 'Designer · Looking for: Dev' }, { n: 'DP', name: 'David Park', role: 'Founder · Looking for: Advisor' }].map(p => (
                  <div key={p.n} className="mini-profile"><div className="mini-avatar" /><div className="mini-info"><p className="mock-name">{p.name}</p><p>{p.role}</p></div></div>
                ))}
              </div></div>
            </div>
            <div className="preview-card animate delay-1">
              <p className="preview-label">Profile Screen</p>
              <div className="mini-phone"><div className="mini-screen">
                <div className="mini-header"><p className="mock-title">Profile</p><div className="dots"><span /><span /><span /></div></div>
                <div className="profile-detail"><div className="big-avatar" /><p className="mock-name">Alex Morgan</p><p>Building in fintech · Series A</p></div>
                <div className="profile-stats">
                  {[{ n: '96', l: 'Trust' }, { n: '12', l: 'Connections' }, { n: '3', l: 'Intents' }].map(s => <div key={s.l} className="stat-box"><div className="num">{s.n}</div><div className="lbl">{s.l}</div></div>)}
                </div>
              </div></div>
            </div>
            <div className="preview-card animate delay-2">
              <p className="preview-label">Chat Screen</p>
              <div className="mini-phone"><div className="mini-screen">
                <div className="mini-header"><p className="mock-title">Alex Morgan</p><div className="dots"><span /><span /><span /></div></div>
                <div className="mini-chat">
                  <div className="chat-bubble received">Hi! I saw you&apos;re looking for a technical co-founder. I&apos;m building something similar in the climate space.</div>
                  <div className="chat-bubble sent">Hey Alex — yes, exactly. Would love to hear more about your background.</div>
                  <div className="chat-bubble received">Sure. Ex-Stripe engineer, 6 years in infra. Looking for someone with GTM experience.</div>
                </div>
              </div></div>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation */}
      <section className="diff-section" id="differentiation">
        <div className="section-inner">
          <p className="section-label animate">Why This Is Different</p>
          <h2 className="section-title animate delay-1">A new category of networking.</h2>
          <p className="section-desc animate delay-2">We didn&apos;t improve existing networking. We rebuilt it from first principles — starting with intent, not identity.</p>
          <div className="diff-grid">
            {[
              { icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, title: 'Intent-Based Discovery', body: 'Traditional networks show you who people are. We show you what they want. You discover based on shared purpose, not shared connections.', d: '' },
              { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, title: 'Trust Score', body: 'Every profile carries a transparent trust score based on verification depth, connection quality, and community feedback. No guesswork.', d: 'delay-1' },
              { icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, title: 'Relevance Over Volume', body: 'We optimize for quality of connection, not quantity. A single relevant conversation is worth more than a hundred random contacts.', d: 'delay-2' },
            ].map(c => (
              <div key={c.title} className={`diff-card animate ${c.d}`}>
                <div className="diff-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{c.icon}</svg></div>
                <h3>{c.title}</h3><p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Circles */}
      <section id="circles">
        <div className="section-inner">
          <p className="section-label animate">Now Live</p>
          <h2 className="section-title animate delay-1">Post what you need. Skip the waiting.</h2>
          <p className="section-desc animate delay-2">Discover is 1:1 — you get matched, then you talk. Circles skips that part: post exactly what you&apos;re after (a co-founder, an intro, an answer to something you&apos;re stuck on) and it lands in front of everyone tracking that, not just the handful of people you&apos;d have matched with anyway.</p>
          <div className="circles-showcase animate delay-2">
            <div className="circles-card">
              <div className="circles-card-head">
                <div className="circles-card-avatar" />
                <div><p className="circles-card-name">Priya Sharma</p><p className="circles-card-meta">2m ago</p></div>
                <span className="circles-card-tag">Seeking</span>
              </div>
              <p className="circles-card-text">Looking for a growth marketer to launch a B2B SaaS product — let&apos;s build together.</p>
              <div className="circles-card-actions">
                <button className="circles-card-btn" type="button" tabIndex={-1}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
                  12
                </button>
                <button className="circles-card-btn collab" type="button" tabIndex={-1}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  Collaborate
                </button>
              </div>
            </div>
            <p className="circles-caption">One post, real interest — people can Like it or hit Collaborate to reach out directly.</p>
            <a href="/signup" className="btn-primary">Explore Circles Free</a>
          </div>
        </div>
      </section>

      {/* Download */}
      <section className="download-section" id="download">
        <div className="section-inner">
          <p className="section-label animate">Get Started</p>
          <h2 className="section-title animate delay-1">Start in seconds, no install required</h2>
          <p className="section-desc animate delay-2">The full Build Your Network experience runs directly in your browser. Sign up and start discovering in under a minute.</p>
          <div className="download-box animate delay-3">
            <a href="/signup" className="download-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              Open Web App Free
            </a>
            <div className="download-meta">
              {['Works on all devices', 'No download needed', 'Instant access'].map(m => (
                <span key={m}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>{m}</span>
              ))}
            </div>
            <div className="install-steps">
              {[{ n: 1, title: 'Open in browser', body: 'Click the button above. Works on Chrome, Safari, Firefox — desktop or mobile.' }, { n: 2, title: 'Sign up free', body: 'Create your account and set your networking intent. Takes under 60 seconds.' }, { n: 3, title: 'Start discovering', body: 'Browse relevant profiles, connect with intent, and have real conversations.' }].map(s => (
                <div key={s.n} className="install-step"><div className="num">{s.n}</div><h3>{s.title}</h3><p>{s.body}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About BYN */}
      <section id="about-byn" style={{ background: 'var(--bg-secondary)', padding: '80px 0' }}>
        <div className="section-inner">
          <p className="section-label animate">Knowledge Base</p>
          <h2 className="section-title animate delay-1">What is Build Your Network?</h2>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            <p className="animate delay-2" style={{ fontSize: '17px', color: 'var(--text-secondary)', lineHeight: '1.75', marginBottom: '20px' }}>
              <strong style={{ color: 'var(--text)' }}>Build Your Network (BYN)</strong> is a free professional networking platform for founders, entrepreneurs, and creators in India. It connects you with co-founders, mentors, investors, and collaborators based on your goals and stated intent — not job titles or follower counts.
            </p>
            <p className="animate delay-2" style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.75', marginBottom: '20px' }}>
              Every user on BYN declares what they are actively looking for — a co-founder, a technical partner, a mentor, an investor, or a collaborator. This intent-first approach means every discovery result is someone actively seeking the same kind of relationship. No recruiter spam. No feed noise. Just relevant connections.
            </p>
            <p className="animate delay-3" style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: '1.75', marginBottom: '36px' }}>
              BYN uses GPS-based location matching — discover founders within 10 km for in-person collaboration or search nationwide for remote co-founders. It runs entirely in your browser. No app install required. Available across India: Hyderabad, Bengaluru, Mumbai, Delhi, Pune, Chennai, and every other city.
            </p>
            <div className="animate delay-3" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[{ href: '/networking-for-founders', label: 'Networking for Founders' }, { href: '/linkedin-alternative', label: 'BYN vs LinkedIn' }, { href: '/networking-for-entrepreneurs', label: 'For Entrepreneurs' }, { href: '/networking-for-creators', label: 'For Creators' }, { href: '/networking-for-freelancers', label: 'For Freelancers' }, { href: '/startup-community-india', label: 'Startup Community India' }, { href: '/business-networking-app', label: 'Business Networking App' }, { href: '/networking-for-investors', label: 'For Investors' }].map(l => (
                <a key={l.href} href={l.href} style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(15,118,110,.15)' }}>{l.label}</a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background: 'var(--card)', padding: '80px 0' }}>
        <div className="section-inner">
          <h2 className="animate" style={{ textAlign: 'center', marginBottom: '8px', fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: '800', letterSpacing: '-1px' }}>Frequently Asked Questions</h2>
          <p className="animate delay-1" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '48px' }}>Everything you need to know about Build Your Network</p>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {[
              { q: 'What is Build Your Network?', a: 'Build Your Network (BYN) is a free professional networking platform for founders, entrepreneurs, and creators in India. It connects you with co-founders, mentors, investors, and collaborators based on your goals and stated intent — not job titles or work history. BYN uses GPS-based location matching and runs entirely in your browser — no install required.', d: 'delay-1' },
              { q: 'How is Build Your Network different from LinkedIn?', a: 'LinkedIn is built for job-seekers and recruiters. Build Your Network is built for founders and entrepreneurs who want co-founders, mentors, advisors, and investors — matched by intent and skills. On BYN: no recruiter spam, no feed noise, no vanity metrics. Every person you see has declared what they are actively looking for, making first messages contextual and response rates far higher.', d: 'delay-2' },
              { q: 'How do I find a co-founder on Build Your Network?', a: 'Create a free profile, set your intent to "Looking for Co-founder", add your skills and startup description, and enable location discovery. BYN surfaces founders with complementary skills within your chosen radius. You can filter by city (Hyderabad, Bengaluru, Mumbai, etc.) or search Remote/Worldwide for technical co-founders anywhere in India.', d: 'delay-3' },
              { q: 'Is Build Your Network free?', a: 'Yes — BYN is free with 30 daily connection requests. No install, no credit card. Premium plans unlock unlimited connections, priority discovery, exact location filters (10/25/50 km), and profile boosting for founders who want faster results.', d: 'delay-4' },
              { q: 'Is Build Your Network available across India?', a: 'Yes. Build Your Network supports founders and entrepreneurs in every major Indian city — Hyderabad, Bengaluru, Mumbai, Delhi, Pune, Chennai, Kolkata, Ahmedabad, Jaipur, and more. GPS-based filters let you discover connections within 10 km, 50 km, 200 km, or search nationwide and worldwide.', d: 'delay-1' },
              { q: 'Who uses Build Your Network?', a: 'Build Your Network is used by startup founders, solo entrepreneurs, freelancers, creators, product managers, designers, developers, angel investors, and mentors — anyone who wants meaningful professional connections based on intent and goals.', d: 'delay-2' },
              { q: 'How does the location filter work?', a: 'BYN uses GPS to show you professionals within 200 km by default. Premium users can tighten that to 10, 25, or 50 km for hyper-local co-founder discovery. You can also set Remote-only or Worldwide to find collaborators anywhere without location constraints.', d: 'delay-3' },
              { q: 'Is my data safe on Build Your Network?', a: 'Yes. Your email is never shared with other users. Exact GPS coordinates are only used to compute distance — never exposed to other profiles. All data is stored securely on Supabase with Row-Level Security policies enforced. BYN has no ads and does not sell user data.', d: 'delay-4' },
            ].map((f, i) => (
              <details key={i} className={`faq-item animate ${f.d}`}>
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
            <a href="/signup" className="btn-primary" style={{ fontSize: '17px', padding: '18px 40px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              Open Web App Free
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
          <div className="footer-col"><h3>Product</h3><a href="#features">Features</a><a href="#how">How It Works</a><a href="#faq">FAQ</a><a href="/signup">Open Web App</a></div>
          <div className="footer-col"><h3>Support</h3><a href="mailto:support@buildyournetwork.online">support@buildyournetwork.online</a></div>
        </div>
        <div className="footer-bottom"><span>&copy; 2026 Build Your Network. All rights reserved.</span><span>Early Access Product</span></div>
      </footer>

      {/* Feedback widget — client island */}
      <FeedbackWidget />

      {/* JSON-LD schema — now server-rendered in initial HTML */}
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
  );
}
