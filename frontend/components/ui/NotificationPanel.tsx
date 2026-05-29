'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import type { CircleNotification } from '@/lib/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

type Props = {
  onClose: () => void;
  onAllRead: () => void;
};

export default function NotificationPanel({ onClose, onAllRead }: Props) {
  const [notifs, setNotifs] = useState<CircleNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    apiGet<{ notifications: CircleNotification[] }>('/api/notifications')
      .then(d => setNotifs(d.notifications))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    if (marking) return;
    setMarking(true);
    try {
      await apiPatch('/api/notifications/read', {});
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
      onAllRead();
    } catch {
      // silent
    } finally {
      setMarking(false);
    }
  }

  const hasUnread = notifs.some(n => !n.read);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="notif-overlay" onClick={onClose} />
      <div className="notif-panel" role="dialog" aria-label="Notifications">
        <div className="notif-panel-header">
          <span className="notif-panel-title">Notifications</span>
          {hasUnread && (
            <button className="notif-mark-read-btn" onClick={markAllRead} disabled={marking}>
              Mark all read
            </button>
          )}
        </div>

        <div className="notif-list">
          {loading && (
            <div className="notif-empty">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && notifs.length === 0 && (
            <div className="notif-empty">
              <div className="notif-empty-title">No notifications yet</div>
              <div className="notif-empty-sub">
                When someone wants to collaborate on your post, you&apos;ll see it here.
              </div>
            </div>
          )}

          {!loading && notifs.map(n => {
            const initials = n.actor_name
              ? n.actor_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              : '?';

            return (
              <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
                <div className="notif-avatar">
                  {n.actor_photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={n.actor_photo} alt={n.actor_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : initials}
                </div>
                <div className="notif-content">
                  <div className="notif-actor">
                    <strong>{n.actor_name ?? 'Someone'}</strong>
                    <span className="notif-action"> wants to collaborate on your post</span>
                  </div>
                  {n.ref_text && (
                    <div className="notif-excerpt">&ldquo;{n.ref_text}&rdquo;</div>
                  )}
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
