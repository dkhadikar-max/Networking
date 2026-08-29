/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SAMPLE_USER } from './samples';
import { formatIntent } from '@/lib/intent';
import ProfileView from '@/components/profile/ProfileView';


/**
 * Discovery summary card — the decision layer.
 *
 * Shows enough to decide "I want to know this person":
 * photo → identity → intent → building → looking for → match signal → actions
 *
 * Deliberately NOT the full 2,500px editorial profile.
 * "View Full Profile" transitions to the unconstrained editorial document.
 */
export default function DiscoverySummaryCard() {
  const u = SAMPLE_USER as any;
  const name: string        = u.name                ?? '';
  const photos: string[]    = u.photos              ?? [];
  const headline: string    = u.headline            ?? '';
  const location: string    = u.location            ?? '';
  const intent: string      = u.intent              ?? '';
  const working_on: string  = u.working_on          ?? '';
  const exploring: string   = u.currently_exploring ?? '';
  const skills: string[]    = u.skills              ?? [];
  const verified: boolean   = u.verified            ?? false;
  const profileScore: number = u.profile_score      ?? 92;
  const intentLabel         = formatIntent(intent);
  const initials            = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const [imgErr, setImgErr]             = useState(false);
  const [connected, setConnected]       = useState(false);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [mounted, setMounted]           = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasPhoto = photos.length > 0 && !imgErr;


  return (
    /* Outer card — border-radius + overflow:hidden clips photo corners cleanly */
    <div style={{
      width: '100%',
      maxWidth: 420,
      background: '#ffffff',
      color: '#0F172A',
      colorScheme: 'light',
      borderRadius: 24,
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.08)',
      border: '1px solid rgba(0,0,0,0.05)',
      position: 'relative',
      zIndex: 1,
    }}>


      {/* ── PHOTO ─ 280px, objectPosition top shows the face with perfect framing ── */}
      <div style={{ height: 280, background: '#CBD5E1', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {hasPhoto ? (
          <img
            src={photos[0]}
            alt={name}
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E2E8F0' }}>
            <span style={{ fontSize: 80, fontWeight: 800, color: '#94A3B8', letterSpacing: '-2px' }}>{initials}</span>
          </div>
        )}

        {/* deep gradient — photo blends into identity below without a seam */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)',
        }} />

        {/* Priority badge — top right */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,243,238,0.96)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(230,100,0,0.28)', borderRadius: 8,
          padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#C2410C',
        }}>⚡ Priority</div>

        {/* Identity pinned to photo bottom — seamless into content below */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.15, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
              {name}
            </span>
            {verified && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#34D399" style={{ flexShrink: 0 }}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
          </div>
          {headline && (
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.35, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
              {headline}
            </p>
          )}
        </div>
      </div>

      {/* ── CONTENT — zero gap from photo (same background, no border) ── */}
      <div style={{ padding: '12px 18px 0' }}>

        {/* Location + trust + intent — compact single row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          {location && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 500, color: '#64748B' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {location}
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#157A6E', background: '#F0FDF9', border: '1px solid rgba(21,122,110,0.2)', padding: '2px 8px', borderRadius: 5 }}>
            🛡️ Trust {profileScore}
          </span>
          {intentLabel && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#C2410C', background: '#FFF7ED', border: '1px solid rgba(194,65,12,0.2)', padding: '2px 8px', borderRadius: 5 }}>
              🎯 {intentLabel}
            </span>
          )}
        </div>

        {/* ── MATCH SIGNAL — shown before generic content ── */}
        <div style={{
          background: 'linear-gradient(135deg, #F0FDF9 0%, #ECFDF5 100%)',
          border: '1px solid rgba(21,122,110,0.16)',
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#157A6E', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 4px' }}>
            💡 Direct Match
          </p>
          <p style={{ fontSize: 12, color: '#1E293B', lineHeight: 1.55, margin: 0 }}>
            You&apos;re both building in SaaS. Deep is specifically looking for someone technical to take ownership of product and engineering at Revisit.
          </p>
        </div>

        {/* BUILDING */}
        {working_on && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#157A6E', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 3px' }}>Building</p>
            <p style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {working_on}
            </p>
          </div>
        )}

        {/* LOOKING FOR */}
        {exploring && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#157A6E', letterSpacing: '0.8px', textTransform: 'uppercase', margin: '0 0 3px' }}>Looking For</p>
            <p style={{ fontSize: 13, color: '#1E293B', lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {exploring}
            </p>
          </div>
        )}

        {/* SKILLS */}
        {skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {skills.slice(0, 4).map(s => (
              <span key={s} style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '3px 8px', borderRadius: 6 }}>
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── ACTIONS ───────────────────────────────────────── */}
      <div style={{ padding: '2px 18px 8px', display: 'flex', gap: 10 }}>
        <button style={{
          flex: 1, padding: '12px 0', borderRadius: 12,
          border: '1.5px solid #E2E8F0', background: '#F8FAFC',
          fontSize: 14, fontWeight: 700, color: '#64748B', cursor: 'pointer',
        }}>
          Skip
        </button>
        <button
          onClick={() => setConnected(c => !c)}
          style={{
            flex: 2, padding: '12px 0', borderRadius: 12, border: 'none',
            background: connected ? '#0D6E63' : '#157A6E',
            fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {connected ? '✓ Connected' : 'Connect'}
        </button>
      </div>

      {/* ── VIEW FULL PROFILE ─────────────────────────────── */}
      <div style={{ padding: '2px 18px 16px' }}>
        <button
          onClick={() => setShowFullProfile(true)}
          style={{
            width: '100%', padding: '9px 0', background: 'transparent', border: 'none',
            fontSize: 12, fontWeight: 700, color: '#157A6E', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            letterSpacing: '0.1px',
          }}
        >
          View Full Profile
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* ── UNCONSTRAINED FULL EDITORIAL PROFILE MODAL/OVERLAY ── */}
      {mounted && showFullProfile && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999999,
          backgroundColor: '#ffffff',
          overflowY: 'auto',
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto', minHeight: '100vh', background: '#ffffff' }}>
            <ProfileView
              user={SAMPLE_USER}
              isSelf={false}
              connected={connected}
              onConnect={async () => setConnected(true)}
              onBack={() => setShowFullProfile(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
