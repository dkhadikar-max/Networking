/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import WhyThisMatch from './WhyThisMatch';
import { apiGet } from '@/lib/api';

interface Profile {
  id: string;
  name: string;
  headline: string | null;
  profession: string | null;
  location: string | null;
  photos: string[];
  interests: string[];
  intent: string | null;
}

interface Props {
  profiles: Profile[];
  userInterests: string[];
  onDone: () => void;
}

interface ReferralData {
  code: string;
  link: string;
  count: number;
}

export default function SuggestedConnections({ profiles, userInterests, onDone }: Props) {
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiGet<ReferralData>('/api/profile/referral')
      .then(setReferral)
      .catch(() => null);
  }, []);

  function handleCopy() {
    if (!referral) return;
    navigator.clipboard.writeText(referral.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waText = referral
    ? `I just joined Build Your Network — the professional network built on real relationships. Come connect: ${referral.link}`
    : `I just joined Build Your Network — the professional network built on real relationships: https://buildyournetwork.online/app`;

  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Success header */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18,
          background: 'linear-gradient(145deg,#157A6E,#0E5E55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
          boxShadow: '0 8px 24px rgba(21,122,110,0.28)',
        }}>
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="25" cy="25" r="10" fill="#1DB7A6"/>
            <circle cx="75" cy="50" r="16" fill="#1DB7A6"/>
            <circle cx="25" cy="75" r="10" fill="#F4A259"/>
            <line x1="34" y1="30" x2="62" y2="44" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            <line x1="25" y1="35" x2="25" y2="64" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            <line x1="34" y1="70" x2="62" y2="56" stroke="white" strokeWidth="7" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px', marginBottom: 6 }}>
          You&apos;re in.
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          {profiles.length > 0
            ? 'People worth knowing based on your profile.'
            : 'Your feed will fill as you explore. Go build.'}
        </p>
      </div>

      {/* Suggested profiles */}
      {profiles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profiles.slice(0, 5).map((p, i) => {
            const shared = (p.interests ?? []).filter(t => userInterests.includes(t));
            const initials = p.name.slice(0, 2).toUpperCase();
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px', borderRadius: 16,
                  background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                }}
              >
                {p.photos?.[0] ? (
                  <img
                    src={p.photos[0]}
                    alt={p.name}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#D5F5EE,#EDF9FF)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800, color: '#157A6E',
                  }}>
                    {initials}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.headline ?? p.profession ?? 'BYN member'}
                  </p>
                  {p.location && (
                    <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>📍 {p.location}</p>
                  )}
                  <WhyThisMatch
                    sharedInterests={shared}
                    sharedIntent={p.intent}
                    mutualConnections={0}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Referral block */}
      <div style={{
        borderRadius: 16,
        border: '1.5px solid rgba(21,122,110,0.2)',
        background: 'linear-gradient(135deg,#D5F5EE,#EDF9FF)',
        padding: '16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
            Refer 10 friends → get 1 month Premium free
          </p>
          <p style={{ fontSize: 12, color: '#157A6E', lineHeight: 1.5 }}>
            Every friend who joins counts. Share your link below.
          </p>
          {referral && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(21,122,110,0.15)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min((referral.count / 10) * 100, 100)}%`,
                  height: '100%', borderRadius: 2,
                  background: '#157A6E', transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#157A6E', flexShrink: 0 }}>
                {referral.count}/10
              </span>
            </div>
          )}
          {referral && referral.count >= 10 && (
            <p style={{ fontSize: 12, fontWeight: 700, color: '#157A6E', marginTop: 6 }}>
              You&apos;ve earned 1 month Premium! Check your account.
            </p>
          )}
        </div>

        {referral && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.7)', borderRadius: 10,
            border: '1px solid rgba(21,122,110,0.15)', padding: '10px 12px',
          }}>
            <span style={{ fontSize: 12, color: '#64748B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
              {referral.link}
            </span>
            <button
              onClick={handleCopy}
              style={{
                fontSize: 12, fontWeight: 700, color: copied ? '#22C55E' : '#157A6E',
                flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'color 0.15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 16px', borderRadius: 12,
            background: '#157A6E', color: '#fff',
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 4px 12px rgba(21,122,110,0.25)',
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'currentColor', flexShrink: 0 }}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.562 4.14 1.541 5.876L0 24l6.305-1.518A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.895 0-3.668-.523-5.184-1.432l-.371-.22-3.742.901.937-3.637-.242-.384A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          Share on WhatsApp
        </a>
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={onDone}
          style={{
            width: '100%', padding: '15px 16px', borderRadius: 12,
            background: '#F4A259', color: '#fff', border: 'none',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(244,162,89,0.3)',
            fontFamily: 'inherit',
          }}
        >
          Go to my feed →
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8' }}>
          Add a photo to unlock full discovery and connections
        </p>
      </div>

    </div>
  );
}
