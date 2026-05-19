'use client';

import { motion } from 'framer-motion';
import clsx from 'clsx';
import { sharedInterests } from '@/lib/network/matching';
import type { Connection } from '@/lib/retention/signals';

interface Props {
  connections: Connection[];
  userInterests: string[];
}

export default function MutualOpportunities({ connections, userInterests }: Props) {
  const opportunities = connections
    .map(c => ({
      connection: c,
      shared: sharedInterests(
        { interests: userInterests },
        { interests: c.user.interests ?? [] },
      ),
    }))
    .filter(o => o.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 4);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Add more interests to surface collaboration opportunities.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[var(--text)]">Collaboration opportunities</h3>
      <div className="grid grid-cols-1 gap-3">
        {opportunities.map(({ connection: c, shared }, i) => (
          <motion.div
            key={c.connection.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            className="p-4 rounded-xl border border-[var(--border)] bg-white"
          >
            <div className="flex items-center gap-3 mb-3">
              {c.user.photos?.[0] ? (
                <img src={c.user.photos[0]} alt={c.user.name} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[var(--highlight)] flex items-center justify-center text-[var(--primary)] font-bold text-sm">
                  {c.user.name[0]}
                </div>
              )}
              <div>
                <p className="font-semibold text-sm text-[var(--text)]">{c.user.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{c.user.headline ?? 'BYN member'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {shared.slice(0, 4).map(tag => (
                <span
                  key={tag}
                  className={clsx(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    'bg-[var(--highlight)] text-[var(--primary)]',
                  )}
                >
                  {tag}
                </span>
              ))}
              {shared.length > 4 && (
                <span className="px-2 py-0.5 rounded-full text-xs text-[var(--text-muted)]">
                  +{shared.length - 4} more
                </span>
              )}
            </div>

            <a
              href="https://buildyournetwork.online/webapp.html#connections"
              className="mt-3 block text-center text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Start a collaboration conversation →
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
