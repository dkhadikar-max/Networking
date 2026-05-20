'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import ConversationList from '@/components/chat/ConversationList';
import type { Connection } from '@/lib/types';

export default function ChatListPage() {
  const toast = useToast();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ connections: Connection[] }>('/api/connections')
      .then(r => setConnections(r.connections ?? []))
      .catch(() => toast('Failed to load chats', 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div className="chat-list-header">
        <div style={{ flex: 1 }}>
          <h1>Messages</h1>
          {!loading && (
            <p className="chat-list-sub">
              {connections.length} active {connections.length === 1 ? 'conversation' : 'conversations'}
            </p>
          )}
        </div>
      </div>
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
