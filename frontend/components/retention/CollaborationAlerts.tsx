'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import Avatar from '@/components/ui/Avatar';
import type { Connection } from '@/lib/retention/signals';

interface Props {
  staleConnections: Connection[];
}

export default function CollaborationAlerts({ staleConnections }: Props) {
  if (staleConnections.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-2xs">
        <p className="text-xs font-semibold text-slate-500">All connections are active and engaged 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-slate-900 text-base tracking-tight">
          Keep Momentum Alive <span className="text-slate-400 font-medium text-xs">({staleConnections.length})</span>
        </h3>
      </div>
      <div className="space-y-2">
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
              className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-[#157A6E]/40 hover:shadow-xs transition-all"
            >
              <Avatar
                src={c.user.photos?.[0]}
                name={c.user.name}
                size={44}
                online={(c.user as { is_online?: boolean }).is_online}
              />

              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-sm text-slate-900 truncate">{c.user.name}</p>
                <p className="text-xs text-slate-400 font-medium truncate">
                  {c.lastMessage ? `Last message ${lastAt}` : lastAt}
                </p>
              </div>

              <Link
                href={`/chat/${c.connection.id}`}
                className="shrink-0 px-3.5 py-1.5 rounded-xl bg-[#157A6E] text-white text-xs font-bold hover:bg-[#0D5F58] active:scale-95 transition-all shadow-2xs"
              >
                Send Note →
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
