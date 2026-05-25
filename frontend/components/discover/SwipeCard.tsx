/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef } from 'react';
import type { DiscoverProfile } from '@/lib/types';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';

type Props = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
};

export default function SwipeCard({ profile, onConnect, onSkip }: Props) {
  const user = profile.user ?? profile;
  const name = (user as { name?: string }).name ?? 'Unknown';
  const photos: string[] = (user as { photos?: string[] }).photos ?? [];
  const headline = (user as { headline?: string }).headline ?? '';
  const location = (user as { location?: string }).location ?? '';
  const bio = (user as { bio?: string }).bio ?? '';
  const intentsRaw = user as { intents?: string[]; intent?: string };
  const intents: string[] = intentsRaw.intents ?? (intentsRaw.intent ? [intentsRaw.intent] : []);
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];
  const skills: string[] = (user as { skills?: string[] }).skills ?? [];
  const working_on = (user as { working_on?: string }).working_on ?? '';
  const currently_exploring = (user as { currently_exploring?: string }).currently_exploring ?? '';
  const score = profile.match_score ?? profile.matchScore;
  const trust_score = (profile as { trust_score?: number }).trust_score ?? (user as { trust_score?: number }).trust_score;
  const matchReasons: string[] = profile.matchReasons ?? (profile.insight ? [profile.insight] : []);
  const connected = !!profile.connection;
  const verified = (user as { identity_verified?: boolean }).identity_verified;

  const uid = (user as { id?: string }).id ?? (profile as { id?: string }).id ?? '';

  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const connectLabelRef = useRef<HTMLDivElement>(null);
  const skipLabelRef = useRef<HTMLDivElement>(null);
  const dragXRef = useRef(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function triggerConnect() {
    if (connected || connecting) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  async function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    await triggerConnect();
  }

  function handleSkip(e: React.MouseEvent) {
    e.stopPropagation();
    onSkip();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      dragXRef.current = dx;
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
        cardRef.current.style.transition = 'none';
      }
      if (connectLabelRef.current) connectLabelRef.current.style.opacity = dx > 20 ? String(Math.min((dx - 20) / 60, 1)) : '0';
      if (skipLabelRef.current) skipLabelRef.current.style.opacity = dx < -20 ? String(Math.min((-dx - 20) / 60, 1)) : '0';
    }
  }

  async function handleTouchEnd() {
    const dx = dragXRef.current;
    dragXRef.current = 0;
    touchStartX.current = null;
    touchStartY.current = null;
    if (connectLabelRef.current) connectLabelRef.current.style.opacity = '0';
    if (skipLabelRef.current) skipLabelRef.current.style.opacity = '0';
    if (Math.abs(dx) >= 80) {
      const flyX = dx > 0 ? window.innerWidth * 1.4 : -window.innerWidth * 1.4;
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.28s ease-in';
        cardRef.current.style.transform = `translateX(${flyX}px) rotate(${dx > 0 ? 25 : -25}deg)`;
      }
      await new Promise<void>(r => setTimeout(r, 260));
      if (dx > 0) await triggerConnect();
      else onSkip();
    } else {
      if (cardRef.current) {
        cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
        cardRef.current.style.transform = '';
      }
    }
  }

  return (
    <div
      ref={cardRef}
      className="swipe-card"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative' }}
    >
      {/* Swipe indicators */}
      <div ref={connectLabelRef} style={{ position: 'absolute', top: 14, left: 16, zIndex: 20, background: 'rgba(21,184,166,0.95)', color: 'white', padding: '5px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13, border: '2px solid rgba(255,255,255,0.5)', opacity: 0, pointerEvents: 'none' }}>CONNECT ✓</div>
      <div ref={skipLabelRef} style={{ position: 'absolute', top: 14, right: 16, zIndex: 20, background: 'rgba(239,68,68,0.95)', color: 'white', padding: '5px 14px', borderRadius: 8, fontWeight: 800, fontSize: 13, border: '2px solid rgba(255,255,255,0.5)', opacity: 0, pointerEvents: 'none' }}>SKIP ✗</div>

      {/* 1. INTENT — top, full-width banner */}
      {intents[0] ? (
        <div className="card-intent-banner">{intents[0]}</div>
      ) : (
        <div className="card-intent-banner" style={{ background: 'var(--sur2)', color: 'var(--muted)' }}>Open to connect</div>
      )}

      {/* 2. IDENTITY — avatar + name + trust indicators */}
      <div className="card-identity">
        <div className="card-avatar">
          {photos[0]
            ? <img src={photos[0]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</span>
          {(headline || location) && (
            <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headline}{headline && location ? ' · ' : ''}{location}
            </div>
          )}
        </div>
        {/* Trust cluster: verification + identity + match% */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {verified && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'rgba(21,122,110,0.08)', padding: '2px 7px', borderRadius: 6, border: '1px solid rgba(21,122,110,0.2)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--primary)"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              Verified
            </span>
          )}
          {score != null && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'linear-gradient(135deg,#D5F5EE,#BBF0E7)', padding: '3px 8px', borderRadius: 8 }}>
              {score}% match
            </span>
          )}
          {trust_score != null && (
            <span style={{ fontSize: 10, fontWeight: 600, color: trust_score >= 70 ? 'var(--primary)' : 'var(--muted)', background: 'var(--sur2)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {trust_score >= 70 ? '✓ Trusted' : `Trust ${trust_score}`}
            </span>
          )}
        </div>
      </div>

      {/* WHY YOU MATCHED — between identity and scroll body */}
      {matchReasons.length > 0 && (
        <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid var(--border)', background: 'rgba(21,122,110,0.04)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Why you matched</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matchReasons.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0 }}><circle cx="4" cy="4" r="4" fill="var(--primary)"/></svg>
                {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable body */}
      <div className="card-scroll-body">

        {/* 3. WHAT THEY'RE BUILDING */}
        {working_on && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--sur2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Building</div>
            <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.55, margin: 0 }}>{working_on}</p>
          </div>
        )}

        {/* 4. LOOKING FOR */}
        {currently_exploring && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--sur2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Looking for</div>
            <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.55, margin: 0 }}>{currently_exploring}</p>
          </div>
        )}

        {/* Bio */}
        {bio && (
          <p style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.65, marginBottom: 12 }}>{bio}</p>
        )}

        {/* Photos — media integrated after substance */}
        {photos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(135deg,#D8FAF2,#FEE9D1)', aspectRatio: '4/3' }}>
              <img
                src={photos[photoIdx]}
                alt={name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {photos.length > 1 && (
                <>
                  {/* Tap left/right halves to navigate — uses onClick so card swipe (touch) is unaffected */}
                  <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.max(0, i - 1)); }} style={{ position: 'absolute', left: 0, top: 0, width: '45%', height: '100%', zIndex: 5, cursor: 'pointer' }} />
                  <div onClick={e => { e.stopPropagation(); setPhotoIdx(i => Math.min(photos.length - 1, i + 1)); }} style={{ position: 'absolute', right: 0, top: 0, width: '45%', height: '100%', zIndex: 5, cursor: 'pointer' }} />
                  {/* Dot indicators — 28px touch target, 6px visual dot */}
                  <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', zIndex: 6 }}>
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        onClick={e => { e.stopPropagation(); setPhotoIdx(i); }}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'block', background: i === photoIdx ? 'white' : 'rgba(255,255,255,0.5)' }} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 5. SKILLS / INTERESTS */}
        {skills.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Skills</div>
            <div className="chips-row" style={{ marginBottom: 0 }}>
              {skills.map(s => <span key={s} className="chip chip-gold">{s}</span>)}
            </div>
          </div>
        )}
        {interests.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Interests</div>
            <div className="chips-row" style={{ marginBottom: 0 }}>
              {interests.map(t => <span key={t} className="chip">{t}</span>)}
            </div>
          </div>
        )}
      </div>

      {/* 6. CTA — always visible at bottom */}
      <div className="card-actions">
        <button className="action-btn action-skip" onClick={handleSkip}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Skip
        </button>
        {uid && (
          <button
            className="action-btn"
            onClick={e => { e.stopPropagation(); setShowPriority(true); }}
            style={{ background: 'linear-gradient(135deg,#FEF3C7,#FDE68A)', color: '#92400E', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            ⚡ Priority
          </button>
        )}
        <button
          className="action-btn action-connect"
          onClick={handleConnect}
          disabled={connected || connecting}
        >
          {connecting ? (
            <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'wa-spin 0.65s linear infinite' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          )}
          {connected ? 'Requested' : 'Connect'}
        </button>
      </div>

      <PriorityMessageModal
        open={showPriority}
        onClose={() => setShowPriority(false)}
        mode="compose"
        targetId={uid}
        targetName={name}
      />
    </div>
  );
}
