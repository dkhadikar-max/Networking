'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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

  function goToProfile(actorId: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    if (!actorId) return;
    onClose();
    router.push(`/profile/${actorId}`);
  }

  function goToPost(e: React.MouseEvent) {
    e.stopPropagation();
    onClose();
    router.push('/circles');
  }

  const hasUnread = notifs.some(n => !n.read);

  return (
    // Overlay IS the container — panel is flex child so align-items:flex-end works
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="notif-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="notif-panel" role="dialog" aria-label="Notifications" onClick={e => e.stopPropagation()}>
        {/* Drag handle */}
        <div className="notif-drag-handle" />

        <div className="notif-panel-header">
          <span className="notif-panel-title">Notifications</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasUnread && (
              <button className="notif-mark-read-btn" onClick={markAllRead} disabled={marking}>
                Mark all read
              </button>
            )}
            <button className="notif-close-btn" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
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
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={goToPost}>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div
                  className="notif-avatar"
                  onClick={e => goToProfile(n.actor_id, e)}
                  title={`View ${n.actor_name ?? 'profile'}`}
                >
                  {n.actor_photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={n.actor_photo} alt={n.actor_name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : initials}
                </div>
                <div className="notif-content">
                  <div className="notif-actor">
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <span
                      className="notif-actor-name"
                      onClick={e => goToProfile(n.actor_id, e)}
                    >
                      {n.actor_name ?? 'Someone'}
                    </span>
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
    </div>
  );
}
