'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import ConversationList from '@/components/chat/ConversationList';
import PriorityMessageModal from '@/components/ui/PriorityMessageModal';
import type { Connection } from '@/lib/types';

export default function ChatListPage() {
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPriority, setShowPriority] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll(initial = false) {
      if (cancelled) return;
      let delay = 10_000;
      try {
        const r = await apiGet<Connection[]>('/api/connections');
        if (!cancelled) { setConnections(r ?? []); errors = 0; }
        delay = document.hidden ? 30_000 : 10_000;
      } catch {
        if (initial && !cancelled) toast('Failed to load chats', 'error');
        errors = Math.min(errors + 1, 5);
        delay = Math.min(10_000 * 2 ** errors, 60_000);
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(() => poll(), delay);
    }

    poll(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="chat-list-header">
        <div style={{ flex: 1 }}>
          <h1>Chat</h1>
          {!loading && (
            <p className="chat-list-sub">
              {connections.length} {connections.length === 1 ? 'conversation' : 'conversations'}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowPriority(true)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 10, fontSize: 20, lineHeight: 1, color: 'var(--accent)' }}
          title="Priority messages"
        >
          ⚡
        </button>
      </div>
      <PriorityMessageModal open={showPriority} onClose={() => setShowPriority(false)} mode="inbox" />
      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : (
        <div className="chat-rows-area">
          <ConversationList connections={connections} />
        </div>
      )}
    </div>
  );
}
