'use client';
import { APP_URL } from '@/lib/seo/data';
import { useState } from 'react';

interface Faq { q: string; a: string }

interface Props {
  headline: string;
  subheadline: string;
  body: string;
  tags?: string[];
  faqs: Faq[];
  cta?: string;
  breadcrumb: { label: string; href: string }[];
  stats?: unknown; // accepted but not displayed — real user counts unavailable
}

// Express brand tokens
const C = {
  bg:          '#FFF4EC',
  bgSecondary: '#FDE8D7',
  card:        '#FFFFFF',
  primary:     '#0F766E',
  highlight:   '#CCFBF1',
  text:        '#1F2937',
  textSec:     '#6B7280',
  textMuted:   '#9CA3AF',
};

export default function SeoPage({ headline, subheadline, body, tags, faqs, cta, breadcrumb, stats }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', -apple-system, sans-serif", color: C.text }}>

      {/* ── Nav — fixed sticky glass morphism ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,244,236,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(253,232,215,0.6)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontWeight: 800, fontSize: 18, color: C.primary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src="/assets/logo.png" alt="Build Your Network" width={26} height={26} style={{ borderRadius: 6 }} />
            BuildYourNetwork
          </a>
          <a href="/signup" style={{
            background: C.primary, color: '#fff', padding: '9px 18px',
            borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none',
          }}>
            Join Free
          </a>
        </div>
      </nav>

      {/* ── Page body — top padding for fixed nav ── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Breadcrumb */}
        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 32 }}>
          <a href="/" style={{ color: C.primary, textDecoration: 'none' }}>Home</a>
          {breadcrumb.map(b => (
            <span key={b.href}> › <a href={b.href} style={{ color: C.primary, textDecoration: 'none' }}>{b.label}</a></span>
          ))}
        </p>

        {/* ── Hero ── */}
        {tags && tags.length > 0 && (
          <span style={{
            display: 'inline-block', background: C.highlight, color: C.primary,
            fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 100,
            marginBottom: 16, letterSpacing: '0.02em', textTransform: 'uppercase',
          }}>
            {tags[0]}
          </span>
        )}

        <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, marginBottom: 20 }}>
          {headline}
        </h1>

        <p style={{ fontSize: 18, color: C.textSec, lineHeight: 1.7, marginBottom: 36, maxWidth: 680 }}>
          {subheadline}
        </p>


        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 64 }}>
          <a href="/signup" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', background: C.primary, color: '#fff',
            textDecoration: 'none', borderRadius: 10, fontWeight: 600, fontSize: 15,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Get Started — Free
          </a>
          <a href="#why" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 24px', color: C.primary,
            textDecoration: 'none', borderRadius: 10, fontWeight: 600, fontSize: 15,
            border: `2px solid ${C.primary}`,
          }}>
            Learn more
          </a>
        </div>

        {/* ── Direct answer / body ── */}
        <div style={{
          background: C.card,
          borderLeft: `4px solid ${C.primary}`,
          borderRadius: '0 12px 12px 0',
          padding: '22px 26px',
          marginBottom: 48,
          fontSize: 16, lineHeight: 1.75, color: C.text,
        }}>
          <p>{body}</p>
        </div>

        {/* ── Why BYN ── */}
        <section id="why" style={{ marginBottom: 64 }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>
            Why Build Your Network?
          </h2>
          <p style={{ fontSize: 16, color: C.textSec, marginBottom: 32 }}>
            Purpose-built for founders, operators, and creators in India.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
            {[
              { icon: '🎯', title: 'Intent-based matching', desc: 'Connect only with people actively seeking what you offer — both sides declare goals upfront.' },
              { icon: '📍', title: 'GPS discovery', desc: 'Find co-founders, mentors, and investors within 10 km, 50 km, or 200 km of your city.' },
              { icon: '🤝', title: 'Context-first connections', desc: 'No cold messages. Both parties see each other\'s intent before the first connection request.' },
              { icon: '🆓', title: 'Free to join', desc: '30 daily connections, direct messaging, and discovery — no subscription required.' },
              { icon: '⚡', title: 'No install needed', desc: 'Works in your mobile browser. No app download, no setup. Start networking in seconds.' },
            ].map(item => (
              <div key={item.icon} style={{
                background: C.card, border: `1px solid ${C.bgSecondary}`,
                borderRadius: 16, padding: 22,
              }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{item.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA block ── */}
        <section style={{
          background: C.primary, borderRadius: 20, padding: '48px 40px',
          textAlign: 'center', color: '#fff', marginBottom: 64,
        }}>
          <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, marginBottom: 12 }}>
            {cta ?? 'Join the network'}
          </h2>
          <p style={{ fontSize: 15, opacity: 0.85, marginBottom: 24 }}>
            Free to join. No app download needed. Start connecting in seconds.
          </p>
          <a href="/signup" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '14px 28px', background: '#fff', color: C.primary,
            textDecoration: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
          }}>
            Create Free Account →
          </a>
        </section>

        {/* ── FAQ ── */}
        {faqs.length > 0 && (
          <section style={{ marginBottom: 64 }}>
            <h2 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>
              Frequently asked questions
            </h2>
            <p style={{ fontSize: 16, color: C.textSec, marginBottom: 32 }}>
              Common questions about Build Your Network.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {faqs.map((faq, i) => (
                <div key={faq.q} style={{ border: `1px solid ${C.bgSecondary}`, borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: '100%', padding: '18px 20px', fontWeight: 600, fontSize: 15,
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: C.card, border: 'none', textAlign: 'left', color: C.text,
                      fontFamily: 'inherit',
                    }}
                  >
                    {faq.q}
                    <span style={{ fontSize: 20, color: C.primary, fontWeight: 400, flexShrink: 0, marginLeft: 12 }}>
                      {openFaq === i ? '−' : '+'}
                    </span>
                  </button>
                  {openFaq === i && (
                    <div style={{ padding: '0 20px 18px', background: C.card, fontSize: 14, color: C.textSec, lineHeight: 1.7 }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${C.bgSecondary}`, padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: C.textMuted }}>
          © {new Date().getFullYear()} buildyournetwork.online ·{' '}
          <a href="/privacy" style={{ color: C.primary, textDecoration: 'none' }}>Privacy</a>
          {' · '}
          <a href="/terms" style={{ color: C.primary, textDecoration: 'none' }}>Terms</a>
          {' · '}
          <a href="/support" style={{ color: C.primary, textDecoration: 'none' }}>Support</a>
        </p>
      </footer>

    </div>
  );
}
