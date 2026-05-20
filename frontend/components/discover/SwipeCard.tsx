/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import type { DiscoverProfile } from '@/lib/types';

type Props = {
  profile: DiscoverProfile;
  onConnect: () => Promise<void>;
  onSkip: () => void;
  onSelect: () => void;
};

export default function SwipeCard({ profile, onConnect, onSkip, onSelect }: Props) {
  const user = profile.user ?? profile;
  const name = (user as { name?: string }).name ?? 'Unknown';
  const photos: string[] = (user as { photos?: string[] }).photos ?? [];
  const headline = (user as { headline?: string }).headline ?? '';
  const location = (user as { location?: string }).location ?? '';
  const bio = (user as { bio?: string }).bio ?? '';
  const intents: string[] = (user as { intents?: string[] }).intents ?? [];
  const interests: string[] = (user as { interests?: string[] }).interests ?? [];
  const score = profile.match_score ?? profile.matchScore;
  const connected = !!profile.connection;
  const verified = (user as { identity_verified?: boolean }).identity_verified;

  const [photoIdx, setPhotoIdx] = useState(0);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect(e: React.MouseEvent) {
    e.stopPropagation();
    if (connected || connecting) return;
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  function handleSkip(e: React.MouseEvent) {
    e.stopPropagation();
    onSkip();
  }

  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="swipe-card" onClick={onSelect}>
      {/* Photo */}
      <div className="card-photo">
        {photos[photoIdx] ? (
          <img
            src={photos[photoIdx]}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div className="card-photo-placeholder">{initials}</div>
        )}
        <div className="card-gradient" />
        {verified && (
          <div className="card-verified">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Verified
          </div>
        )}
        {photos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setPhotoIdx(i); }}
                style={{ width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', background: i === photoIdx ? 'white' : 'rgba(255,255,255,0.45)', padding: 0 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="card-body">
        <div className="card-name">
          {name}
          {score != null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', background: 'linear-gradient(135deg,#D5F5EE,#BBF0E7)', padding: '4px 10px', borderRadius: 10, letterSpacing: 0 }}>
              {score}% match
            </span>
          )}
        </div>
        {(headline || location) && (
          <div className="card-role">
            {headline}{headline && location ? ' · ' : ''}{location}
          </div>
        )}
        {(intents.length > 0 || interests.length > 0) && (
          <div className="chips-row">
            {intents.slice(0, 2).map(t => <span key={t} className="chip">{t}</span>)}
            {interests.slice(0, 2).map(t => <span key={t} className="chip chip-gold">{t}</span>)}
          </div>
        )}
        {bio && <p className="card-bio">{bio.slice(0, 120)}{bio.length > 120 ? '…' : ''}</p>}
      </div>

      {/* Actions */}
      <div className="card-actions">
        <button className="action-btn action-skip" onClick={handleSkip}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Skip
        </button>
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
    </div>
  );
}
