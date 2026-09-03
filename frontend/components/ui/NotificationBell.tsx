'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/api';
import NotificationPanel from './NotificationPanel';
import { IconBell } from '@/components/ui/BynIcons';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchCount = useCallback(async () => {
    const d = await apiGet<{ count: number }>('/api/notifications/unread-count');
    setCount(d.count ?? 0);
  }, []);

  // Bug 6 fix: exponential backoff + tab-visibility awareness
  useEffect(() => {
    let cancelled = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;
      if (!document.hidden) {
        try { await fetchCount(); errors = 0; }
        catch { errors = Math.min(errors + 1, 5); }
      }
      if (!cancelled) {
        const delay = document.hidden ? 60_000 : Math.min(30_000 * 2 ** errors, 120_000);
        timer = setTimeout(tick, delay);
      }
    }

    function onVisible() {
      if (!document.hidden && !cancelled) {
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
      }
    }

    fetchCount().catch(() => {});
    timer = setTimeout(tick, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchCount]);

  // Bug 3 fix: don't clear badge on open — only clear when explicitly marked read
  function handleOpen() {
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    fetchCount().catch(() => {}); // re-sync badge after browsing panel without marking read
  }

  return (
    <>
      <button className="notif-bell-btn" onClick={handleOpen} aria-label="Notifications">
        <IconBell size={20} strokeWidth={2} />
        {count > 0 && (
          <span className="notif-badge">{count > 9 ? '9+' : count}</span>
        )}
      </button>

      {open && (
        <NotificationPanel
          onClose={handleClose}
          onAllRead={() => setCount(0)}
        />
      )}
    </>
  );
}
