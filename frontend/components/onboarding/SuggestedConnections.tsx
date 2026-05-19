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

  useEffect(() => {
    apiGet<ReferralData>('/api/profile/referral')
      .then(setReferral)
      .catch(() => null);
  }, []);

  const waText = referral
    ? `I just joined Build Your Network — the professional network built on real relationships. Come connect: ${referral.link}`
    : `I just joined Build Your Network — the professional network built on real relationships: https://buildyournetwork.online/app`;

  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">You&apos;re in. 🎉</h2>
        <p className="text-[var(--text-secondary)] mt-1">
          {profiles.length > 0
            ? 'People worth knowing based on your profile.'
            : "Your feed will fill as you explore. Go build."}
        </p>
      </div>

      {profiles.length > 0 && (
        <div className="space-y-3">
          {profiles.slice(0, 5).map((p, i) => {
            const shared = (p.interests ?? []).filter(t => userInterests.includes(t));
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 p-4 rounded-xl bg-white border border-[var(--border)]"
              >
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt={p.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--highlight)] flex items-center justify-center text-[var(--primary)] font-bold text-lg shrink-0">
                    {p.name[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text)] truncate">{p.name}</p>
                  <p className="text-sm text-[var(--text-secondary)] truncate">
                    {p.headline ?? p.profession ?? 'BYN member'}
                  </p>
                  {p.location && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">📍 {p.location}</p>
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

      {/* Referral invite block */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
        <div>
          <p className="font-semibold text-green-900 text-sm">
            Refer 10 friends → get 1 month Premium free
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            Every friend who joins counts. Share your link below.
          </p>
          {referral && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 bg-green-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((referral.count / 10) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-green-800 shrink-0">
                {referral.count}/10
              </span>
            </div>
          )}
          {referral && referral.count >= 10 && (
            <p className="text-xs font-semibold text-green-900 mt-1">You&apos;ve earned 1 month Premium! Check your account.</p>
          )}
        </div>
        {referral && (
          <div className="flex items-center gap-2 bg-white rounded-lg border border-green-200 px-3 py-2">
            <span className="text-xs text-zinc-500 truncate flex-1 font-mono">{referral.link}</span>
            <button
              onClick={() => navigator.clipboard.writeText(referral.link)}
              className="text-xs text-green-700 font-semibold shrink-0 hover:text-green-900"
            >
              Copy
            </button>
          </div>
        )}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.562 4.14 1.541 5.876L0 24l6.305-1.518A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.895 0-3.668-.523-5.184-1.432l-.371-.22-3.742.901.937-3.637-.242-.384A9.94 9.94 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
          Share on WhatsApp
        </a>
      </div>

      <div className="space-y-3">
        <button
          onClick={onDone}
          className="w-full py-3 rounded-xl bg-[var(--primary)] text-white font-semibold hover:bg-[var(--primary-dark)] transition-colors"
        >
          Go to my feed →
        </button>
        <p className="text-center text-xs text-[var(--text-muted)]">
          Add a photo to unlock full discovery and connections
        </p>
      </div>
    </div>
  );
}
