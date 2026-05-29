'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/api';
import NotificationPanel from './NotificationPanel';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const d = await apiGet<{ count: number }>('/api/notifications/unread-count');
      setCount(d.count ?? 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  function handleOpen() {
    setOpen(true);
    setCount(0); // optimistic clear
  }

  return (
    <>
      <button className="notif-bell-btn" onClick={handleOpen} aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span className="notif-badge">{count > 9 ? '9+' : count}</span>
        )}
      </button>

      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          onAllRead={() => setCount(0)}
        />
      )}
    </>
  );
}
