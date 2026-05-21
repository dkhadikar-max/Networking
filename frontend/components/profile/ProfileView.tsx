/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);

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
          </div>
        )}

        {/* Social links */}
        {hasLinks && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
            {safeHref(user.linkedin) && (
              <a href={safeHref(user.linkedin)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
            )}
            {safeHref(user.website) && (
              <a href={safeHref(user.website)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </a>
            )}
            {user.instagram && (
              <a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sub)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
              </a>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          {isSelf ? (
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
          ) : (
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

    </div>
  );
}
