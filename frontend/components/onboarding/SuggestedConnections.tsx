'use client';

import { motion } from 'framer-motion';
import WhyThisMatch from './WhyThisMatch';

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

export default function SuggestedConnections({ profiles, userInterests, onDone }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text)]">Your first connections</h2>
        <p className="text-[var(--text-secondary)] mt-1">
          {profiles.length > 0
            ? 'People worth knowing based on your profile.'
            : "You're all set — your feed will fill as you explore."}
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
