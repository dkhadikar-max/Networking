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

    function fetchConnections(initial = false) {
      apiGet<Connection[]>('/api/connections')
        .then(r => { if (!cancelled) setConnections(r ?? []); })
        .catch(() => { if (initial) toast('Failed to load chats', 'error'); })
        .finally(() => { if (initial && !cancelled) setLoading(false); });
    }

    fetchConnections(true);

    const timer = setInterval(() => fetchConnections(false), 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="chat-list-header">
        <div style={{ flex: 1 }}>
          <h1>Chat</h1>
          {!loading && (
            <p className="chat-list-sub">
              {connections.length} active {connections.length === 1 ? 'conversation' : 'conversations'}
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
