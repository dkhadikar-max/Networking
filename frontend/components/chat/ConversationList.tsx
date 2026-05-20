'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import Avatar from '@/components/ui/Avatar';
import type { Connection } from '@/lib/types';
import clsx from 'clsx';

type Props = {
  connections: Connection[];
  activeId?: string;
};

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ''; }
}

export default function ConversationList({ connections, activeId }: Props) {
  if (connections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8 text-[var(--muted)]">
        <div>
          <div className="w-14 h-14 rounded-full bg-[var(--light)] flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs mt-1">Connect with someone to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {connections.map(c => {
        const { connection, user, lastMessage, unread_count, hoursLeft } = c;
        const isActive = connection.id === activeId;
        const unread = (unread_count ?? 0) > 0;

        return (
          <Link
            key={connection.id}
            href={`/chat/${connection.id}`}
            className={clsx(
              'flex items-center gap-3 px-4 py-3.5 transition-colors border-b border-[var(--border)]',
              isActive ? 'bg-[var(--light)]' : 'hover:bg-[var(--sur2)]'
            )}
          >
            <Avatar
              src={user.photos?.[0]}
              name={user.name}
              size={44}
              online={user.is_online}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx('text-sm truncate', unread ? 'font-bold text-[var(--text)]' : 'font-semibold text-[var(--text)]')}>
                  {user.name}
                </span>
                {lastMessage && (
                  <span className="text-[10px] text-[var(--muted)] shrink-0">{timeAgo(lastMessage.created_at)}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className={clsx('text-xs truncate', unread ? 'text-[var(--text)] font-medium' : 'text-[var(--sub)]')}>
                  {lastMessage?.text ?? 'Say hello!'}
                </p>
                {unread && (
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                )}
              </div>
              {hoursLeft != null && hoursLeft <= 12 && (
                <p className="text-[10px] text-[var(--accent)] font-semibold mt-0.5">
                  ⏱ {hoursLeft}h left
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
