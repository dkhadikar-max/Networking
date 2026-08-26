/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiDelete } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import Avatar from '@/components/ui/Avatar';
import { formatIntent } from '@/lib/intent';
import type { User } from '@/lib/types';

function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch { return undefined; }
}

function getUncroppedImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  // If Cloudinary URL, remove crop/thumbnail transformation segments to request the uncropped source
  if (url.includes('res.cloudinary.com')) {
    return url.replace(/\/image\/upload\/.*?\/(v\d+\/)/, '/image/upload/q_auto,f_auto/$1');
  }
  // For Unsplash or other CDNs, switch &fit=crop to &fit=max
  if (url.includes('images.unsplash.com')) {
    return url.replace(/&fit=crop/g, '&fit=max');
  }
  return url;
}

type Props = {
  user: User;
  isSelf?: boolean;
  onConnect?: () => Promise<void>;
  connected?: boolean;
  connectionId?: string;
  onEdit?: () => void;
};

// Hierarchy, top to bottom: Identity (hero + about) → Intent (what they
// want) → Capability (what they offer) → Trust & relevance (social proof —
// only when real data exists) → Connection stays in the hero, not buried
// at the bottom, since it's the one action a viewer needs reachable at any
// scroll depth. Every fact below renders in exactly one place — no field
// appears in both the hero and a panel.
export default function ProfileView({ user, isSelf = false, onConnect, connected, connectionId, onEdit }: Props) {
  const { logout } = useAuth();
  const router = useRouter();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [expandedPhoto, setExpandedPhoto] = useState(false);
  const [lightboxError, setLightboxError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const photos = user.photos ?? [];
  const name = user.name ?? '';

  useEffect(() => {
    setLightboxError(false);
  }, [photoIdx, expandedPhoto]);

  useEffect(() => {
    if (!expandedPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedPhoto(false);
      if (e.key === 'ArrowRight' && photos.length > 1) {
        setPhotoIdx((prev) => (prev + 1) % photos.length);
      }
      if (e.key === 'ArrowLeft' && photos.length > 1) {
        setPhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedPhoto, photos.length]);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    try {
      await apiDelete('/api/me');
      logout();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete account');
      setDeleting(false);
    }
  }

  const inits = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const skills = user.skills ?? [];
  const interests = user.interests ?? [];

  async function handleConnect() {
    if (!onConnect) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  const hasLinks = !!(safeHref(user.linkedin) || safeHref(user.website) || user.instagram);

  // Social proof only exists on the /api/profiles/:id response (viewer-
  // relative enrichment) — never on /api/me (self). Rendering is
  // conditioned purely on presence of real data; nothing here is ever
  // inferred or defaulted to a non-empty value.
  const hasReviews = (user.review_summary?.count ?? 0) > 0;
  const hasTrustBadge = user.trust_score != null && user.trust_score >= 70;
  const hasMutual = (user.mutual_count ?? 0) > 0;
  const showTrustPanel = !isSelf && (hasReviews || hasTrustBadge || hasMutual);

  return (
    <div className="profile-scroll">

      {/* IDENTITY — hero: who is this person */}
      <div className="profile-hero">
        <div
          className="hero-av-wrap group"
          role={photos[photoIdx] ? "button" : undefined}
          tabIndex={photos[photoIdx] ? 0 : undefined}
          onClick={() => { if (photos[photoIdx]) setExpandedPhoto(true); }}
          onKeyDown={(e) => { if (photos[photoIdx] && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpandedPhoto(true); } }}
          title={photos[photoIdx] ? "Click to expand photo" : undefined}
          style={{ cursor: photos[photoIdx] ? 'pointer' : 'default', position: 'relative' }}
        >
          <Avatar
            src={photos[photoIdx]}
            name={name}
            size={100}
            className="mx-auto transition-transform group-hover:scale-[1.03]"
          />
          {photos[photoIdx] && (
            <div
              className="absolute inset-0 rounded-full bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
              aria-hidden="true"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </div>
          )}
          {isSelf && user.is_premium && (
            <div className="hero-pro-badge">PRO</div>
          )}
        </div>

        {photos.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setPhotoIdx(i)}
                aria-label={`Show photo ${i + 1}`}
                style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0, background: i === photoIdx ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s' }}
              />
            ))}
          </div>
        )}

        <div className="hero-name">
          {name}
          {user.verified && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--primary)" style={{ display: 'inline', marginLeft: 6, verticalAlign: 'middle' }}>
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          )}
        </div>

        {user.headline && <div className="hero-intent">{user.headline}</div>}

        {user.location && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {user.location}
          </div>
        )}

        {user.bio && (
          <p style={{ marginTop: 14, fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.6 }}>{user.bio}</p>
        )}

        {/* Profile score bar — self only, a completion utility, not part of
            the viewer-facing hierarchy below */}
        {isSelf && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Profile Score</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{user.profile_score ?? 0}/100</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${user.profile_score ?? 0}%`,
                background: 'linear-gradient(90deg, var(--primary), var(--primary-2))',
                borderRadius: 3,
                transition: 'width 0.6s ease',
              }} />
            </div>
            {(user.profile_score ?? 0) < 70 && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#D5F5EE,#EDF9FF)', border: '1px solid #B8EDE5' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Complete your profile to appear in discovery</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!user.intent && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+20</span>
                      Set your intent (edit profile)
                    </div>
                  )}
                  {(user.photos?.length ?? 0) < 1 && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+10</span>
                      Add a profile photo
                    </div>
                  )}
                  {!user.bio && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+10</span>
                      Write a short bio
                    </div>
                  )}
                  {!user.location && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+10</span>
                      Add your city
                    </div>
                  )}
                  {(user.interests?.length ?? 0) < 3 && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+20</span>
                      Add 3+ interests
                    </div>
                  )}
                  {(user.photos?.length ?? 0) < 4 && (user.photos?.length ?? 0) >= 1 && (
                    <div style={{ fontSize: 11, color: '#0F766E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #0F766E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8 }}>+20</span>
                      Add 4 photos total for max boost
                    </div>
                  )}
                </div>
              </div>
            )}
            {(user.profile_score ?? 0) >= 70 && (user.profile_score ?? 0) < 90 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-soft)', textAlign: 'center' }}>
                Great profile — add more to stand out
              </div>
            )}
            {(user.profile_score ?? 0) >= 90 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--primary)', fontWeight: 600, textAlign: 'center' }}>
                Profile complete ✓
              </div>
            )}
          </div>
        )}

        {hasLinks && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
            {safeHref(user.linkedin) && (
              <a href={safeHref(user.linkedin)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn profile" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
            )}
            {safeHref(user.website) && (
              <a href={safeHref(user.website)} target="_blank" rel="noopener noreferrer" aria-label="Personal website" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </a>
            )}
            {user.instagram && (
              <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" aria-label="Instagram profile" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
              </a>
            )}
          </div>
        )}

        {/* CONNECTION — kept in the hero, reachable at any scroll depth */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isSelf ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onEdit} className="profile-action-btn profile-action-primary">
                Edit profile
              </button>
              {!(user.premium || user.is_premium) && (
                <button onClick={() => router.push('/upgrade')} className="profile-action-btn profile-action-pro">
                  ⭐ Go Pro
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              <button
                onClick={handleConnect}
                disabled={connected || connecting}
                style={{
                  flex: 1, padding: '13px 16px', borderRadius: 'var(--r-md)',
                  background: connected ? 'var(--sur2)' : 'linear-gradient(135deg, var(--primary), var(--primary-2))',
                  color: connected ? 'var(--text-soft)' : 'white',
                  border: connected ? '1.5px solid var(--border)' : 'none',
                  fontSize: 14, fontWeight: 700,
                  cursor: connected || connecting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', opacity: connecting ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {connecting ? 'Sending…' : connected ? 'Connected' : 'Connect'}
              </button>
              {/* Priority — distinct tertiary control, matches Discover's
                  SwipeCard treatment rather than competing with Connect */}
              <button
                onClick={() => setShowPriority(true)}
                className="priority-fab"
                aria-label="Send a priority message"
                title="Send a priority message"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
              </button>
            </div>
          )}
          {!isSelf && connected && connectionId && connectionId !== 'pending' && (
            <Link href={`/chat/${connectionId}`} style={{ flex: 1, textDecoration: 'none' }}>
              <button style={{
                width: '100%', padding: '13px 16px', borderRadius: 'var(--r-md)',
                border: '1.5px solid var(--border)', background: 'white',
                color: 'var(--text)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Message
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* INTENT — what are they looking for */}
      {(user.intent || user.currently_exploring) && (
        <div className="profile-panel">
          <div className="panel-title">Looking for</div>
          {user.intent && (
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700, marginBottom: user.currently_exploring ? 10 : 0 }}>
              {formatIntent(user.intent)}
            </span>
          )}
          {user.currently_exploring && (
            <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65, margin: 0 }}>{user.currently_exploring}</p>
          )}
        </div>
      )}

      {/* CAPABILITY — what can they offer */}
      {(user.working_on || skills.length > 0) && (
        <div className="profile-panel">
          <div className="panel-title">Building</div>
          {user.working_on && (
            <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65, margin: 0 }}>{user.working_on}</p>
          )}
          {skills.length > 0 && (
            <>
              <div className="panel-subtitle">Skills</div>
              <div className="chips-row" style={{ marginBottom: 0 }}>
                {skills.map(s => <span key={s} className="chip chip-gold">{s}</span>)}
              </div>
            </>
          )}
        </div>
      )}

      {interests.length > 0 && (
        <div className="profile-panel">
          <div className="panel-title">Interests</div>
          <div className="chips-row" style={{ marginBottom: 0 }}>
            {interests.map(tag => <span key={tag} className="chip">{tag}</span>)}
          </div>
        </div>
      )}

      {/* TRUST & RELEVANCE (social proof) — real data only, never shown empty */}
      {showTrustPanel && (
        <div className="profile-panel">
          <div className="panel-title">Trust &amp; feedback</div>
          <div className="trust-proof-row">
            {hasTrustBadge && (
              <span className="trust-proof-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l7 3v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6l7-3z" /><polyline points="9 12 11 14 15 9.5" /></svg>
                Trusted
              </span>
            )}
            {hasReviews && (
              <span className="trust-proof-rating">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {user.review_summary!.avg_rating.toFixed(1)} · {user.review_summary!.count} review{user.review_summary!.count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {hasReviews && user.review_summary!.top_tags.length > 0 && (
            <div className="chips-row" style={{ marginBottom: 0 }}>
              {user.review_summary!.top_tags.map(t => <span key={t.tag} className="chip">{t.tag}</span>)}
            </div>
          )}
          {hasMutual && (
            <p className="trust-proof-mutual">
              {user.mutual_count} mutual connection{user.mutual_count !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Sign out — self only, mobile/tablet (desktop sidebar already has one) */}
      {isSelf && (
        <div className="profile-panel profile-signout-mobile" style={{ paddingTop: 0 }}>
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--border)', background: 'var(--sur2)',
              color: 'var(--text-soft)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Danger zone — self only */}
      {isSelf && (
        <div className="profile-panel" style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 'var(--r-md)',
                border: '1.5px solid #FCA5A5', background: 'transparent',
                color: '#EF4444', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Delete account
            </button>
          ) : (
            <div style={{ background: '#FEF2F2', borderRadius: 'var(--r-md)', padding: '16px', border: '1px solid #FECACA' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', marginBottom: 6 }}>Permanently delete account?</p>
              <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.55 }}>
                All your data — profile, connections, messages, and works — will be permanently erased. This cannot be undone.
              </p>
              {deleteError && (
                <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 'var(--r-md)',
                    border: '1.5px solid var(--border)', background: 'white',
                    color: 'var(--text)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 'var(--r-md)',
                    border: 'none', background: '#EF4444',
                    color: 'white', fontSize: 13, fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showPriority && (
        <PriorityMessageModal
          open={showPriority}
          onClose={() => setShowPriority(false)}
          mode="compose"
          targetId={user.id}
          targetName={user.name ?? ''}
        />
      )}

      {/* EXPANDED PHOTO LIGHTBOX */}
      {expandedPhoto && photos[photoIdx] && (
        <div
          role="dialog"
          aria-label="Expanded profile photo"
          aria-modal="true"
          className="fixed inset-0 z-[300] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none"
          onClick={() => setExpandedPhoto(false)}
        >
          {/* Top Bar: Title & Close */}
          <div className="fixed top-4 inset-x-4 flex items-center justify-between z-10 max-w-4xl mx-auto pointer-events-none">
            <div className="text-white/90 text-xs font-semibold bg-black/60 px-3.5 py-1.5 rounded-full backdrop-blur-md pointer-events-auto border border-white/10">
              {name} {photos.length > 1 && `(${photoIdx + 1}/${photos.length})`}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpandedPhoto(false); }}
              aria-label="Close photo"
              className="w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white flex items-center justify-center text-lg font-bold cursor-pointer transition-all pointer-events-auto border border-white/10"
            >
              ✕
            </button>
          </div>

          {/* Main Photo Container */}
          <div
            className="relative max-w-full max-h-[82vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {!lightboxError ? (
              <img
                src={getUncroppedImageUrl(photos[photoIdx])}
                alt={`${name} photo ${photoIdx + 1}`}
                onError={() => setLightboxError(true)}
                className="max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-2xl shadow-2xl transition-all"
              />
            ) : (
              <div className="w-72 h-72 sm:w-96 sm:h-96 rounded-2xl bg-gradient-to-br from-[#D8FAF2] to-[#FFF4E7] flex flex-col items-center justify-center text-center p-6 border border-white/20 shadow-2xl">
                <span className="text-5xl font-extrabold text-[#157A6E] mb-2">{inits}</span>
                <span className="text-slate-700 text-sm font-semibold">{name}</span>
                <span className="text-slate-500 text-xs mt-1">Full resolution image unavailable</span>
              </div>
            )}
          </div>

          {/* Multi-photo controls */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
                }}
                aria-label="Previous photo"
                className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-2xl font-bold backdrop-blur-md transition-all active:scale-95 border border-white/10 cursor-pointer"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoIdx((prev) => (prev + 1) % photos.length);
                }}
                aria-label="Next photo"
                className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-2xl font-bold backdrop-blur-md transition-all active:scale-95 border border-white/10 cursor-pointer"
              >
                ›
              </button>

              <div
                className="fixed bottom-5 inset-x-0 flex justify-center gap-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`Go to photo ${i + 1}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      i === photoIdx ? 'w-6 bg-[#157A6E]' : 'w-2 bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
