'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import Avatar from '@/components/ui/Avatar';
import type { Connection } from '@/lib/types';

type Props = {
  connections: Connection[];
  activeId?: string;
  onSelect?: (connectionId: string) => void;
};

function timeAgo(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
      .replace('about ', '')
      .replace('less than a minute ago', 'just now');
  } catch {
    return '';
  }
}

export default function ConversationList({ connections, activeId, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return connections;
    return connections.filter(c => {
      const name = c.user?.name?.toLowerCase() ?? '';
      const headline = c.user?.headline?.toLowerCase() ?? '';
      const intent = c.user?.intent?.toLowerCase() ?? '';
      const last = c.lastMessage?.text?.toLowerCase() ?? '';
      return name.includes(q) || headline.includes(q) || intent.includes(q) || last.includes(q);
    });
  }, [connections, search]);

  if (connections.length === 0) {
    return (
      <div className="chat-empty p-8 text-center flex flex-col items-center justify-center flex-1 bg-white">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl mb-3 shadow-xs">
          💬
        </div>
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">No conversations yet</h3>
        <p className="text-sm font-sans text-slate-500 max-w-[240px] leading-relaxed">
          Connect with builders and founders in Discovery to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Search Bar */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="relative flex items-center">
          <svg className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 hover:bg-slate-100 focus:bg-slate-100 text-sm font-sans text-slate-900 rounded-xl border border-slate-100 focus:border-[#157A6E] focus:outline-none transition-all shadow-sm placeholder:text-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 text-xs text-slate-400 hover:text-slate-900/80 p-0.5 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-2 pb-4 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl mb-3 shadow-xs">
              🔍
            </div>
            <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">No matches</h3>
            <p className="text-sm font-sans text-slate-500 max-w-[240px] leading-relaxed mb-3">
              Nothing matches &quot;{search}&quot;. Try a different name or keyword.
            </p>
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-sm font-semibold text-[#157A6E] hover:underline cursor-pointer"
            >
              Clear search
            </button>
          </div>
        ) : (
          filtered.map(c => {
            const { connection, user, lastMessage, unread_count, hoursLeft, is_priority } = c;

            if (!user) {
              return (
                <div key={connection.id} className="p-3 rounded-2xl opacity-50 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 font-display text-sm">
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-slate-600">Conversation unavailable</p>
                    <p className="text-xs font-sans text-slate-400 truncate">Profile data could not be loaded.</p>
                  </div>
                </div>
              );
            }

            const isActive = activeId === connection.id;
            const isUnread = (unread_count ?? 0) > 0;

            const rowContent = (
              <div
                className={`p-3.5 rounded-2xl flex items-center gap-3.5 transition-all active:scale-[0.98] cursor-pointer group ${
                  isActive
                    ? 'bg-teal-50/50 border border-[#157A6E]/30 shadow-sm'
                    : isUnread
                    ? 'bg-slate-100 border border-slate-200 shadow-sm hover:bg-slate-100'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                {/* Avatar */}
                <Avatar
                  src={user.photos?.[0]}
                  name={user.name ?? 'Builder'}
                  size={48}
                  online={user.is_online}
                />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                    <span className="font-sans font-semibold text-[15px] text-slate-900 tracking-tight truncate flex items-center gap-1.5 min-w-0">
                      {is_priority && <span className="text-[#E65100] shrink-0" title="Priority Connection">⚡</span>}
                      <span className="truncate">{user.name}</span>
                    </span>
                    {lastMessage && (
                      <span className="text-[11px] font-sans text-slate-400 font-medium shrink-0">
                        {timeAgo(lastMessage.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className={`text-sm font-sans truncate min-w-0 ${isUnread ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
                      {lastMessage?.text ?? 'Say hello! 👋'}
                    </p>

                    {/* Unread Badge */}
                    {isUnread && (
                      <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#157A6E] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                        {unread_count! > 99 ? '99+' : unread_count}
                      </span>
                    )}
                  </div>

                  {/* Expiry Badge */}
                  {hoursLeft != null && hoursLeft <= 24 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="text-[10px] font-bold font-sans tracking-wide uppercase text-[#E65100] bg-[#E65100]/10 px-2 py-0.5 rounded border border-[#E65100]/20">
                        ⏳ {hoursLeft}h left
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );

            return onSelect ? (
              <button
                key={connection.id}
                type="button"
                onClick={() => onSelect(connection.id)}
                className="w-full text-left p-0 border-none bg-transparent block"
              >
                {rowContent}
              </button>
            ) : (
              <Link
                key={connection.id}
                href={`/chat/${connection.id}`}
                className="block text-decoration-none"
              >
                {rowContent}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
