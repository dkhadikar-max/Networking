'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import type { Connection } from '@/lib/retention/signals';

interface Props {
  staleConnections: Connection[];
}

export default function CollaborationAlerts({ staleConnections }: Props) {
  if (staleConnections.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-center">
        <p className="text-sm text-[var(--text-muted)]">All connections are active 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[var(--text)]">
        Reconnect <span className="text-[var(--text-muted)] font-normal text-sm">({staleConnections.length})</span>
      </h3>
      {staleConnections.map((c, i) => {
        const lastAt = c.lastMessage?.created_at
          ? formatDistanceToNow(new Date(c.lastMessage.created_at), { addSuffix: true })
          : 'Never messaged';

        return (
          <motion.div
            key={c.connection.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-[var(--border)] bg-white hover:border-[var(--teal)] transition-colors"
          >
            {c.user.photos?.[0] ? (
              <Image src={c.user.photos[0]} alt={c.user.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" unoptimized />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--highlight)] flex items-center justify-center text-[var(--primary)] font-bold shrink-0">
                {c.user.name[0]}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-[var(--text)] truncate">{c.user.name}</p>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {c.lastMessage ? `Last message ${lastAt}` : lastAt}
              </p>
            </div>

            <a
              href="https://buildyournetwork.online/webapp.html#connections"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:bg-[var(--primary-dark)] transition-colors"
            >
              Message
            </a>
          </motion.div>
        );
      })}
    </div>
  );
}
