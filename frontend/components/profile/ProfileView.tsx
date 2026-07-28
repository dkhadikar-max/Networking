/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiDelete } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import { formatIntent } from '@/lib/intent';
import type { User } from '@/lib/types';

function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch { return undefined; }
}

type Props = {
  user: User;
  isSelf?: boolean;
  onConnect?: () => Promise<void>;
  connected?: boolean;
  connectionId?: string;
  onEdit?: () => void;
};

export default function ProfileView({ user, isSelf = false, onConnect, connected, connectionId, onEdit }: Props) {
  const { logout } = useAuth();
  const router = useRouter();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const photos = user.photos ?? [];
  const name = user.name ?? '';
  const inits = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  async function handleConnect() {
    if (!onConnect) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  const hasLinks = !!(safeHref(user.linkedin) || safeHref(user.website) || user.instagram);

  return (
    <div className="profile-scroll">

      {/* Hero card */}
      <div className="profile-hero">
        <div className="hero-av-wrap">
          <div className="hero-av">
            {photos[photoIdx] ? (
              <img src={photos[photoIdx]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : inits}
          </div>
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

        {/* Intent — the core BYN signal */}
        {(user.intent || user.working_on) && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(21,122,110,0.07)', border: '1px solid rgba(21,122,110,0.18)', textAlign: 'center' }}>
            {user.intent && (
              <span style={{ display: 'inline-block', padding: '3px 14px', borderRadius: 999, background: 'var(--primary)', color: 'white', fontSize: 11, fontWeight: 700, marginBottom: user.working_on ? 8 : 0 }}>
                {formatIntent(user.intent)}
              </span>
            )}
            {user.working_on && (
              <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.45, margin: 0 }}>
                {user.working_on}
              </p>
            )}
          </div>
        )}
        {/* Compact chips in hero — quick intent scan */}
        {((user.skills?.length ?? 0) > 0 || (user.interests?.length ?? 0) > 0) && (
          <div className="chips-row" style={{ marginTop: 10, justifyContent: 'center' }}>
            {[...(user.skills ?? []).slice(0, 2), ...(user.interests ?? []).slice(0, 2)].slice(0, 4).map(t => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        )}

        {/* Profile score bar (self only) */}
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
            {/* Completion hint — three tiers */}
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

        {/* Social links */}
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

        {/* Action buttons */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isSelf ? (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onEdit}
                  style={{
                    flex: 1, padding: '13px 16px', borderRadius: 'var(--r-md)',
                    border: '1.5px solid var(--border)', background: 'white',
                    color: 'var(--text)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Edit profile
                </button>
                {!(user.premium || user.is_premium) && (
                  <button
                    onClick={() => router.push('/upgrade')}
                    style={{
                      flex: 1, padding: '13px 16px', borderRadius: 'var(--r-md)',
                      background: 'linear-gradient(135deg, #F4A259, #e8923f)',
                      border: 'none', color: 'white', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 14px rgba(244,162,89,0.35)',
                    }}
                  >
                    ⭐ Go Pro
                  </button>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
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
              <button
                onClick={() => setShowPriority(true)}
                style={{
                  padding: '13px 16px', borderRadius: 'var(--r-md)',
                  background: 'linear-gradient(135deg,#FCD34D,#F59E0B)',
                  color: '#78350F', border: '1px solid rgba(245,158,11,0.18)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  boxShadow: '0 4px 14px rgba(245,158,11,0.24)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M13 2 3 14h9l-1 8 10-12h-9z"/>
                </svg>
                Priority
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

      {/* Bio */}
      {user.bio && (
        <div className="profile-panel">
          <div className="panel-title">About</div>
          <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65 }}>{user.bio}</p>
        </div>
      )}

      {/* Working on */}
      {user.working_on && (
        <div className="profile-panel">
          <div className="panel-title">Working On</div>
          <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65 }}>{user.working_on}</p>
        </div>
      )}

      {/* Currently exploring */}
      {user.currently_exploring && (
        <div className="profile-panel">
          <div className="panel-title">Exploring</div>
          <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.65 }}>{user.currently_exploring}</p>
        </div>
      )}

      {/* Interests */}
      {(user.interests?.length ?? 0) > 0 && (
        <div className="profile-panel">
          <div className="panel-title">Interests</div>
          <div className="chips-row">
            {user.interests!.map((tag: string) => (
              <span key={tag} className="chip">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {(user.skills?.length ?? 0) > 0 && (
        <div className="profile-panel">
          <div className="panel-title">Skills</div>
          <div className="chips-row">
            {user.skills!.map((s: string) => (
              <span key={s} className="chip chip-gold">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Sign out — self only. Desktop already has one in the sidebar nav (≥1024px),
          so this is scoped to mobile/tablet where the bottom nav has no sign-out entry. */}
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
    </div>
  );
}
