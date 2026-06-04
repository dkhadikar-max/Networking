/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Connection } from '@/lib/types';

type Props = {
  connections: Connection[];
};

function timeAgo(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return ''; }
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function ConversationList({ connections }: Props) {
  if (connections.length === 0) {
    return (
      <div className="chat-empty">
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3>No conversations yet</h3>
        <p>Connect with someone to start chatting</p>
      </div>
    );
  }

  return (
    <>
      {connections.map(c => {
        const { connection, user, lastMessage, unread_count, hoursLeft } = c;
        const unread = (unread_count ?? 0) > 0;
        const photo = user.photos?.[0];

        return (
          <Link
            key={connection.id}
            href={`/chat/${connection.id}`}
            className="chat-row"
          >
            <div className="chat-av-wrap">
              <div className="chat-av">
                {photo ? <img src={photo} alt={user.name} /> : initials(user.name ?? '?')}
              </div>
              {user.is_online && <span className="chat-online" />}
            </div>
            <div className="chat-body">
              <div className="chat-name-row">
                <span className="chat-name">
                  {c.is_priority && <span style={{ color: 'var(--accent)', marginRight: 4 }}>⚡</span>}
                  {user.name}
                </span>
                {lastMessage && (
                  <span className="chat-time">{timeAgo(lastMessage.created_at)}</span>
                )}
              </div>
              <p className={`chat-preview${unread ? ' unread' : ''}`}>
                {lastMessage?.text ?? 'Say hello!'}
              </p>
              {hoursLeft != null && hoursLeft <= 24 && (
                <p style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>
                  ⏱ {hoursLeft}h left
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </>
  );
}
